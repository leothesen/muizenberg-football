#!/usr/bin/env node
/**
 * Play a whole Wednesday, start to finish, against your local machine.
 *
 * Tuesday's poll, the squad answering it, the nudge, the teams going up, the
 * questionnaire, and Thursday's settlement — the same cron routes Vercel calls and
 * the same update handler the Telegram webhook feeds, in the order the real week
 * runs them. Nothing here is a mock of the bot: the RSVPs go in as genuine
 * `callback_query` updates, so what you read afterwards in the emulator is the
 * behaviour, not a description of it.
 *
 * Needs `pnpm pg:setup` to have run and `pnpm dev` to be up.
 *
 *   pnpm mock:week
 *
 * Then open http://localhost:3000/dev/telegram and read the chat.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const BASE = process.env.MOCK_BASE_URL ?? "http://localhost:3000";
const CONTAINER = "muizenberg_postgres";
const SEEDED_GROUP_CHAT_ID = -1001234567890;

// ---------------------------------------------------------------- presentation

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;
const red = (s) => `[31m${s}[0m`;

let stepNumber = 0;
function step(when, what) {
  stepNumber += 1;
  console.log(`\n${bold(`${stepNumber}. ${what}`)}  ${dim(when)}`);
}

function note(text) {
  console.log(`   ${dim(text)}`);
}

function done(text) {
  console.log(`   ${green("✓")} ${text}`);
}

// ---------------------------------------------------------------- environment

/**
 * Read `.env.local` the way the app does.
 *
 * Only two values matter here. `CRON_SECRET`, because if one is set the cron routes
 * demand it and every call would 401 — and `TELEGRAM_LEAGUE_CHAT_ID`, because the
 * emulator addresses whichever chat the app thinks the league lives in, and posting
 * the RSVPs to a different one would look like the buttons silently did nothing.
 */
function readEnvLocal() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return {};
  }

  const out = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const env = readEnvLocal();

/**
 * A variable that is present but empty is not set.
 *
 * `.env.local` files are full of `NAME=` lines waiting to be filled in, and `??`
 * happily accepts the empty string — which then became `Number("")`, which is `0`,
 * which is a real chat id belonging to nobody.
 */
function envValue(name, fallback = "") {
  const raw = process.env[name] ?? env[name];
  return raw !== undefined && raw.trim() !== "" ? raw.trim() : fallback;
}

const cronSecret = envValue("CRON_SECRET");
const chatId = Number(envValue("TELEGRAM_LEAGUE_CHAT_ID", String(SEEDED_GROUP_CHAT_ID)));

// ---------------------------------------------------------------- plumbing

function sql(query) {
  return execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "muizenberg", "-tAc", query],
    { encoding: "utf8" },
  ).trim();
}

async function callCron(path) {
  const headers = cronSecret ? { authorization: `Bearer ${cronSecret}` } : {};
  const response = await fetch(`${BASE}${path}`, { headers });
  const body = await response.text();

  if (!response.ok) {
    // The two that actually happen, and neither error says what to do about it.
    if (body.includes("TELEGRAM_LEAGUE_CHAT_ID")) {
      throw new Error(
        `${path} → ${response.status}\n${body.slice(0, 200)}\n\n` +
          `Set it in .env.local. Locally it can be anything, but it has to match the\n` +
          `chat the emulator shows, so use the seeded group:\n\n` +
          `    TELEGRAM_LEAGUE_CHAT_ID=${SEEDED_GROUP_CHAT_ID}\n`,
      );
    }
    if (response.status === 401) {
      throw new Error(
        `${path} → 401\n\nCRON_SECRET is set in .env.local but this script did not ` +
          `match it.\nUnset it for local development and the cron routes open up ` +
          `automatically outside production.\n`,
      );
    }
    throw new Error(`${path} → ${response.status}\n${body.slice(0, 400)}`);
  }
  return body;
}

async function post(path, payload) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${path} → ${response.status}\n${body.slice(0, 400)}`);
  }
  return body;
}

// ---------------------------------------------------------------- the week

async function main() {
  console.log(bold("\nA whole Wednesday, locally\n"));
  note(`server   ${BASE}`);
  note(`chat     ${chatId}`);
  note(`cron     ${cronSecret ? "authenticated" : "open (no CRON_SECRET set)"}`);

  // A dev server that is not running is by far the most likely reason to be here,
  // and a bare fetch failure does not say so.
  try {
    await fetch(`${BASE}/api/dev/backfill`);
  } catch {
    console.error(
      red("\nNo dev server at ") +
        BASE +
        red(".") +
        "\nRun `pnpm dev` in another terminal first (and `pnpm pg:setup` if you have not).\n",
    );
    process.exit(1);
  }

  step("before the season", "Replay the fantasy engine over the seeded history");
  const backfill = await post("/api/dev/backfill");
  done(backfill.slice(0, 200));
  note("Ratings, badges and the table now exist. Nothing was posted to the chat.");

  step("Tuesday 16:00", "The bot asks who is keen");
  await callCron("/api/cron/rsvp/open");
  const fixtureId = sql(
    "select id from fixtures where status = 'open' order by kickoff_at limit 1",
  );
  if (!fixtureId) throw new Error("No open fixture — did the poll route run?");
  done(`Poll posted and pinned for fixture ${fixtureId}`);

  step("Tuesday evening", "The squad answers the poll");
  // Real callback_query updates through the real handler — the same path a thumb
  // on a button takes. 11 in, 3 out, 2 maybe: a normal week, and an odd number so
  // the balancer has to split 6 v 5 and say so.
  const players = sql(
    "select telegram_user_id from players where telegram_user_id is not null order by id",
  )
    .split("\n")
    .filter(Boolean);

  const answers = players.map((id, index) => ({
    id: Number(id),
    status: index < 11 ? "in" : index < 14 ? "out" : "maybe",
  }));

  const CODE = { in: "i", out: "o", maybe: "m" };
  for (const answer of answers) {
    await post("/api/dev/simulate", {
      action: "callback",
      telegramUserId: answer.id,
      chatId,
      callbackData: `r:${CODE[answer.status]}:${fixtureId}`,
    });
  }
  const counts = answers.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});
  done(`${counts.in} in, ${counts.out} out, ${counts.maybe} maybe`);
  note("The pinned poll edited itself in place each time — that is one message, not 16.");

  step("Wednesday 09:00", "Nudge whoever has not answered");
  await callCron("/api/cron/rsvp/nudge");
  done("Nudge sent");

  step("Wednesday 12:00", "Pick the teams");
  await callCron("/api/cron/teams/pick");
  // A squad is team_players joined through fixture_teams, which is where `side`
  // lives — the players are not labelled a or b themselves.
  const gap = sql(
    `select round(abs(
       avg(p.rating) filter (where ft.side = 'a')
       - avg(p.rating) filter (where ft.side = 'b'))::numeric, 2)
     from team_players tp
     join fixture_teams ft on ft.id = tp.fixture_team_id
     join players p on p.id = tp.player_id
     where tp.fixture_id = '${fixtureId}'`,
  );
  const sizes = sql(
    `select string_agg(n::text, ' v ' order by side) from (
       select ft.side, count(*) n
       from team_players tp
       join fixture_teams ft on ft.id = tp.fixture_team_id
       where tp.fixture_id = '${fixtureId}'
       group by ft.side) s`,
  );
  done(`Teams up: ${sizes || "—"}, average-rating gap ${gap || "—"}`);
  note("Balanced on AVERAGE rating, not total — with 6 v 5 the bigger side always out-totals.");

  step("Wednesday 18:00", "They play");
  // The only piece of theatre in this script, and it is unavoidable: the poll opens
  // the NEXT fixture, which is days away, and everything after the whistle is gated
  // on kickoff having passed. Without this the questionnaire creates no rows and the
  // settlement correctly refuses to settle a game nobody has played yet — which
  // looks exactly like both of them being broken.
  //
  // Fourteen hours, not an arbitrary nudge into the past: settlement refuses a
  // fixture less than twelve hours old, so that everybody has had a night to answer
  // the questionnaire. Wednesday 18:00 to Thursday 08:00 is exactly the real gap,
  // and anything shorter leaves the fixture locked with nothing explaining why.
  sql(
    `update fixtures set kickoff_at = now() - interval '14 hours' where id = '${fixtureId}'`,
  );
  done("Kickoff moved to last night, so the rest of the week can happen");

  step("Wednesday 20:00", "Ask everyone how it went");
  await callCron("/api/cron/reports/ask");
  done("Questionnaire DMed to everybody who played");

  step("Wednesday, later", "Most of the squad answers");
  execFileSync(
    "sh",
    [
      "-c",
      `docker exec -i ${CONTAINER} psql -U postgres -d muizenberg -v ON_ERROR_STOP=1 -q -f - < scripts/fill-reports.sql`,
    ],
    { stdio: "inherit" },
  );
  done("Goals, nutmegs, tackles and MOTM votes filled in");
  note("Deliberately not everybody — the settlement has to cope with a partial return.");

  step("Thursday 08:00", "Settle it");
  await callCron("/api/cron/results/settle");

  // The score is on the teams, not the fixture — each side carries its own goals.
  const summary = sql(
    `select concat(
       'score ', coalesce((select string_agg(coalesce(goals::text, '?'), '-' order by side)
                           from fixture_teams where fixture_id = f.id), '?'),
       ' · status ', f.status,
       ' · rated ', (select count(*) from rating_events where fixture_id = f.id),
       ' · badges ', (select count(*) from player_badges where fixture_id = f.id))
     from fixtures f where f.id = '${fixtureId}'`,
  );
  done(summary);

  console.log(`\n${bold("Now go and read it:")}\n`);
  console.log(`   ${yellow(`${BASE}/dev/telegram`)}   the whole conversation, as the group saw it`);
  console.log(`   ${yellow(`${BASE}/`)}                       the public site`);
  console.log(`   ${yellow(`${BASE}/table`)}                  the season table, now with this week in it`);
  console.log(`   ${yellow(`${BASE}/fixtures`)}               match reports\n`);
  console.log(dim("   In the emulator, switch player at the top to see what each person saw —"));
  console.log(dim("   the DMs are private, so Jonty's questionnaire is not in anybody else's chat.\n"));
  console.log(dim(`   Start over with: pnpm pg:setup && pnpm mock:week\n`));
}

main().catch((error) => {
  console.error(red(`\n${error.message}\n`));
  process.exit(1);
});

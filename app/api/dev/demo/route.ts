import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { GET as askNights } from "@/app/api/cron/nights/ask/route";
import { GET as resolveNights } from "@/app/api/cron/nights/resolve/route";
import { GET as askReports } from "@/app/api/cron/reports/ask/route";
import { GET as settleResults } from "@/app/api/cron/results/settle/route";
import { GET as nudgeRsvp } from "@/app/api/cron/rsvp/nudge/route";
import { GET as openRsvp } from "@/app/api/cron/rsvp/open/route";
import { GET as pickTeams } from "@/app/api/cron/teams/pick/route";
import { handleUpdate } from "@/lib/bot/router";
import { liveServices } from "@/lib/bot/services";
import { liveReportDeps } from "@/lib/bot/report-services";
import { liveFantasyDeps } from "@/lib/bot/fantasy-services";
import { livePictureDeps } from "@/lib/bot/pictures";
import { FIXTURE_PLACEHOLDER, scenarioById, type DemoAction } from "@/lib/demo/scenarios";
import { db } from "@/lib/db";
import {
  fixtures,
  matchReports,
  nightPolls,
  nightVotes,
  playerBadges,
  ratingEvents,
  rsvps,
  telegramEmulatorMessages,
  telegramUpdates,
} from "@/lib/db/schema";
import { devToolsEnabled } from "@/lib/dev-guard";
import { attachRsvpMessage, bookFixture, upcomingFixture } from "@/lib/repo/fixtures";
import { findPlayerByTelegramId } from "@/lib/repo/players";
import { cachedInviteLink, rememberInviteLink } from "@/lib/repo/invite";
import { toggleNightVote, votesForWeek } from "@/lib/repo/nights";
import { leagueChatId, optionalEnv } from "@/lib/env";
import { telegramClient } from "@/lib/telegram/factory";
import type { TelegramUpdate, TelegramUser } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Running one step of a scripted week.
 *
 * The emulator used to offer a row of buttons named after cron routes, which showed
 * what the bot *can* do without ever showing what it *is*. A scenario is the same
 * machinery in an order that tells a story, and this executes one step of one.
 *
 * Everything here drives the real handlers. Nothing is mocked, faked or replayed: the
 * messages the page renders were produced by the same code a live Telegram update
 * would reach, which is the only reason a demo is worth trusting.
 */

const CRONS: Record<string, (request: Request) => Promise<Response>> = {
  "nights-ask": askNights,
  "nights-resolve": resolveNights,
  "rsvp-open": openRsvp,
  "rsvp-nudge": nudgeRsvp,
  "teams-pick": pickTeams,
  "reports-ask": askReports,
  "results-settle": settleResults,
};

/**
 * Wednesday 18:00 to Thursday 08:00, the real gap.
 *
 * Settlement refuses a fixture less than twelve hours old — everybody is meant to get
 * a night to answer the questionnaire — so a fixture that has just kicked off can
 * never be settled and both the questionnaire and the report quietly do nothing.
 */
const HOURS_SINCE_KICKOFF = 14;

let updateId = Date.now();

function botContext() {
  return {
    client: telegramClient(),
    services: liveServices(),
    reports: liveReportDeps(),
    fantasy: liveFantasyDeps(),
    pictures: livePictureDeps(),
    nights: { toggleNightVote, votesForWeek },
    fixtures: { bookFixture, attachRsvpMessage },
    invites: { cachedInviteLink, rememberInviteLink },
    leagueChatId: leagueChatId(),
    botUsername: optionalEnv("TELEGRAM_BOT_USERNAME"),
    now: new Date(),
  };
}

async function deliver(update: TelegramUpdate): Promise<void> {
  await handleUpdate(botContext(), update);
}

function chatId(): number {
  return leagueChatId() ?? 0;
}

/**
 * The real person behind a Telegram id in a script.
 *
 * A scenario names people by id, and several handlers put `message.from.first_name`
 * straight into a message the group reads — so inventing a placeholder name here put
 * "Moved by Player 100007" in the chat, which reads as a bug in the product rather
 * than a shortcut in the demo. Worse, ensurePlayer treats what arrives as the truth
 * from Telegram and would have written that name back over the seed.
 */
async function asUser(telegramUserId: number): Promise<TelegramUser> {
  const player = await findPlayerByTelegramId(telegramUserId);

  return {
    id: telegramUserId,
    is_bot: false,
    first_name: player?.display_name ?? `Player ${telegramUserId}`,
    username: player?.telegram_username ?? undefined,
  };
}

/**
 * Start the week over without losing the season.
 *
 * The seed's played fixtures are what make the table and the player cards worth
 * looking at, so a reset that truncated everything would leave the demo showing an
 * empty league — which is the one state nobody needs to be shown. Only the week in
 * progress is cleared.
 */
async function reset(): Promise<void> {
  const live = db();

  await live.delete(telegramEmulatorMessages);
  await live.delete(nightVotes);
  await live.delete(nightPolls);
  // Every update the demo has already delivered, so replaying a scenario is not
  // silently swallowed by the de-duplication log.
  await live.delete(telegramUpdates);

  const unplayed = live
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(ne(fixtures.status, "played"));

  await live.delete(rsvps).where(sql`${rsvps.fixture_id} in ${unplayed}`);
  await live.delete(matchReports).where(sql`${matchReports.fixture_id} in ${unplayed}`);
  await live.delete(ratingEvents).where(sql`${ratingEvents.fixture_id} in ${unplayed}`);
  await live.delete(playerBadges).where(sql`${playerBadges.fixture_id} in ${unplayed}`);
  await live.delete(fixtures).where(ne(fixtures.status, "played"));
}

/**
 * Bring the booked game to within a few hours.
 *
 * Both timestamps are set explicitly rather than nudged, because every cron reads a
 * different one and a demo that works at 14:00 and hangs at 09:00 is worse than no
 * demo. Kickoff three hours out puts the poll's opening (16:00 the previous day) and
 * the squad's closing firmly in the past, whatever time of day somebody presses play.
 */
async function advance(): Promise<Response> {
  const now = Date.now();

  const moved = await db()
    .update(fixtures)
    .set({
      kickoff_at: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
      rsvp_closes_at: new Date(now - 60 * 60 * 1000).toISOString(),
    })
    .where(ne(fixtures.status, "played"))
    .returning({ id: fixtures.id });

  if (moved.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No game on the books yet — the vote has to be read first." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, moved: moved.length });
}

/**
 * Answer the questionnaire on behalf of most of the squad.
 *
 * Without this the week ends on a null scoreline: the report cron posts, correctly,
 * that nobody said anything. That is a real state and worth showing once, but it is a
 * poor thing to end a demo on — the whole fantasy layer only means something when
 * there are numbers in it.
 *
 * Reuses scripts/fill-reports.sql rather than restating it, because that file already
 * encodes the detail that matters: two people are left deliberately silent, since
 * "somebody never answered" is a state the match report has to handle and the happy
 * path would never show it.
 */
async function fillReports(): Promise<Response> {
  const path = join(process.cwd(), "scripts", "fill-reports.sql");
  const script = await readFile(path, "utf8");

  // sql.raw, and no interpolation anywhere near it: the file is a PL/pgSQL block in
  // dollar quotes, and anything that rewrites the string risks collapsing $$ into $
  // and corrupting the quoting silently.
  await db().execute(sql.raw(script));

  return NextResponse.json({ ok: true });
}

async function play(): Promise<Response> {
  const kickoff = new Date(Date.now() - HOURS_SINCE_KICKOFF * 60 * 60 * 1000);

  const played = await db()
    .update(fixtures)
    .set({ kickoff_at: kickoff.toISOString() })
    .where(eq(fixtures.status, "locked"))
    .returning({ id: fixtures.id });

  if (played.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No locked fixture — the teams have to go up first." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, played: played.length });
}

/**
 * Fill in the fixture a tap refers to.
 *
 * A script cannot know the id of a fixture that will not exist until a cron in step
 * four has run, so it writes a placeholder and this resolves it against whatever the
 * week has actually produced by now.
 */
async function withFixture(data: string): Promise<string | null> {
  if (!data.includes(FIXTURE_PLACEHOLDER)) return data;

  const fixture = await upcomingFixture();
  return fixture ? data.replace(FIXTURE_PLACEHOLDER, fixture.id) : null;
}

async function runAction(action: DemoAction): Promise<Response> {
  switch (action.kind) {
    case "reset":
      await reset();
      return NextResponse.json({ ok: true });

    case "reportAll":
      return fillReports();

    case "advance":
      return advance();

    case "play":
      return play();

    case "cron": {
      const handler = CRONS[action.step];
      if (!handler) {
        return NextResponse.json(
          { ok: false, error: `unknown cron: ${action.step}` },
          { status: 400 },
        );
      }

      // Authenticated server side, so the browser never holds the secret.
      const secret = optionalEnv("CRON_SECRET");
      return handler(
        new Request("http://emulator.local/cron", {
          headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
        }),
      );
    }

    case "join":
      await deliver({
        update_id: (updateId += 1),
        message: {
          message_id: updateId,
          chat: { id: chatId(), type: "supergroup" },
          date: Math.floor(Date.now() / 1000),
          new_chat_members: [
            {
              id: action.user,
              is_bot: false,
              first_name: action.name,
              username: action.name.toLowerCase(),
            },
          ],
        },
      });
      return NextResponse.json({ ok: true });

    case "command":
      await deliver({
        update_id: (updateId += 1),
        message: {
          message_id: updateId,
          chat: { id: chatId(), type: "supergroup" },
          date: Math.floor(Date.now() / 1000),
          from: await asUser(action.user),
          text: action.text,
        },
      });
      return NextResponse.json({ ok: true });

    case "tap":
    case "tapAll": {
      const users = action.kind === "tap" ? [action.user] : action.users;
      const data = await withFixture(action.data);

      if (!data) {
        return NextResponse.json(
          { ok: false, error: "No fixture to answer yet — the poll has not opened." },
          { status: 409 },
        );
      }

      // One at a time, in order. Racing them would make the squad positions — and so
      // who ends up a sub — depend on which promise settled first.
      for (const user of users) {
        await deliver({
          update_id: (updateId += 1),
          callback_query: {
            id: String(updateId),
            chat_instance: "demo",
            from: await asUser(user),
            data,
            message: {
              message_id: updateId,
              chat: { id: chatId(), type: "supergroup" },
              date: Math.floor(Date.now() / 1000),
            },
          },
        });
      }

      return NextResponse.json({ ok: true, taps: users.length });
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!devToolsEnabled()) {
    return NextResponse.json({ ok: false, error: "not available" }, { status: 404 });
  }

  const { scenario, step } = (await request.json()) as {
    scenario?: string;
    step?: number;
  };

  const found = scenario ? scenarioById(scenario) : null;
  if (!found) {
    return NextResponse.json({ ok: false, error: "unknown scenario" }, { status: 400 });
  }

  const entry = typeof step === "number" ? found.steps[step] : undefined;
  if (!entry) {
    return NextResponse.json({ ok: false, error: "no such step" }, { status: 400 });
  }

  try {
    return await runAction(entry.action);
  } catch (error) {
    // A failed step must not look like a hung page. The runner shows the message
    // beside the step that produced it.
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

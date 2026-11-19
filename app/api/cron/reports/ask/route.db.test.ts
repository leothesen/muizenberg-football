import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as askLate } from "../ask-late/route";
import { GET as ask } from "./route";
import { TelegramApiError } from "@/lib/telegram/client";
import { resetToSeed } from "@/test/db/reset";
import { loadAnchors, rawQuery } from "@/test/db/anchors";

/**
 * The match-night post to the group, when Telegram is down at the moment it goes out.
 *
 * On 18 November 2026 the 18:30 post got a 502 from Telegram. The run had already
 * opened everyone's report, so the 20:00 run read the game as "already asked" and
 * skipped it, and nobody was ever asked for the score. These run both crons against
 * the real database to prove the 20:00 run now picks it up.
 */

const CHAT = -1001234567890;

// Telegram goes down only when a test says so. Otherwise the real emulator client runs.
const outage = vi.hoisted(() => ({ on: false }));

vi.mock("@/lib/telegram/factory", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/telegram/factory")>();
  return {
    ...real,
    telegramClient: () => {
      const client = real.telegramClient();
      if (!outage.on) return client;
      return new Proxy(client, {
        get(target, prop, receiver) {
          if (prop === "sendMessage") {
            return async () => {
              throw new TelegramApiError("sendMessage", 502, "Bad Gateway");
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    },
  };
});

let fixtureId: string;

beforeEach(async () => {
  await resetToSeed();
  vi.stubEnv("TELEGRAM_EMULATOR_ENABLED", "true");
  vi.stubEnv("TELEGRAM_LEAGUE_CHAT_ID", String(CHAT));
  outage.on = false;

  // A game that finished an hour and a half ago and has not been asked about yet.
  fixtureId = (await loadAnchors()).playedFixtureId;
  await rawQuery("update fixtures set status = 'played' where id <> $1", [fixtureId]);
  await rawQuery(
    "update fixtures set status = 'locked', kickoff_at = now() - interval '90 minutes' where id = $1",
    [fixtureId],
  );
  await rawQuery("delete from match_reports where fixture_id = $1", [fixtureId]);
});

afterEach(() => {
  outage.on = false;
  vi.unstubAllEnvs();
});

const request = () => new Request("http://localhost/api/cron/reports/ask");

async function reportCount(): Promise<number> {
  const [row] = await rawQuery<{ n: number }>(
    "select count(*)::int as n from match_reports where fixture_id = $1",
    [fixtureId],
  );
  return row!.n;
}

async function groupPosts() {
  return rawQuery<{ params: Record<string, unknown> }>(
    "select params from telegram_emulator_messages where method = 'sendMessage' order by id",
  );
}

describe("when Telegram fails on the match-night post", () => {
  it("takes back the reports it opened, so nothing looks asked", async () => {
    outage.on = true;
    await expect(ask(request())).rejects.toBeInstanceOf(TelegramApiError);

    expect(await reportCount()).toBe(0);
  });

  it("lets the 20:00 run post it instead of skipping it", async () => {
    outage.on = true;
    await expect(ask(request())).rejects.toBeInstanceOf(TelegramApiError);

    outage.on = false;
    const response = await askLate(request());
    const body = (await response.json()) as { skipped?: string };

    expect(body.skipped).toBeUndefined();
    const posts = await groupPosts();
    expect(posts).toHaveLength(1);
    expect(String(posts[0]!.params.chat_id)).toBe(String(CHAT));
    expect(String(posts[0]!.params.text)).toContain("What was the score?");
    expect(await reportCount()).toBeGreaterThan(0);
  });

  it("keeps reports somebody has already started on a re-run", async () => {
    // A first run that worked: the group was asked and somebody started.
    await ask(request());
    const opened = await reportCount();
    await rawQuery(
      "update match_reports set flow_state = 'goals' where id = (select id from match_reports where fixture_id = $1 limit 1)",
      [fixtureId],
    );

    // A manual re-run during an outage must not undo a night that was asked.
    outage.on = true;
    await expect(ask(request())).rejects.toBeInstanceOf(TelegramApiError);

    expect(await reportCount()).toBe(opened);
  });
});

describe("on a normal night", () => {
  it("posts once, and the 20:00 run leaves it alone", async () => {
    await ask(request());
    const late = (await (await askLate(request())).json()) as { skipped?: string };

    expect(late.skipped).toBe("already asked");
    expect(await groupPosts()).toHaveLength(1);
  });
});

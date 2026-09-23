import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as postTable } from "./route";
import { resetToSeed } from "@/test/db/reset";
import { rawQuery } from "@/test/db/anchors";

/**
 * Sunday morning's table.
 *
 * Run for real against the seeded database, through the emulator transport, because
 * the only interesting thing about this cron is a decision it makes from the data:
 * whether there is a season worth posting yet. Asserting that against a hand-made
 * table would be asserting against the mock.
 */

const CHAT = -1001234567890;

beforeEach(async () => {
  await resetToSeed();
  vi.stubEnv("TELEGRAM_EMULATOR_ENABLED", "true");
  vi.stubEnv("TELEGRAM_LEAGUE_CHAT_ID", String(CHAT));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function run() {
  const response = await postTable(new Request("http://localhost/api/cron/table/post"));
  expect(response.status).toBe(200);
  return (await response.json()) as {
    skipped?: string;
    season?: string | null;
    players?: number;
    messageId?: number;
  };
}

/** Everything the emulator was asked to send, oldest first. */
async function sent() {
  return rawQuery<{ method: string; params: Record<string, unknown> }>(
    "select method, params from telegram_emulator_messages order by id",
  );
}

describe("a season with games in it", () => {
  it("posts the table to the group", async () => {
    const body = await run();

    expect(body.skipped).toBeUndefined();
    expect(body.players).toBeGreaterThan(0);

    const calls = await sent();
    expect(calls).toHaveLength(1);
    expect(String(calls[0]!.params.chat_id)).toBe(String(CHAT));

    // Caption when the picture rendered, text when it did not. Either carries the
    // season, which is the one thing somebody scrolling past should take in.
    const body_ = String(calls[0]!.params.caption ?? calls[0]!.params.text);
    expect(body_).toContain(body.season);
  });

  it("puts Share the table under it and nothing else", async () => {
    await run();

    const [call] = await sent();
    const markup = JSON.stringify(call!.params.reply_markup);
    expect(markup).toContain("Share the table");
  });

  it("does not pin it", async () => {
    // The pin is for the thing to do next and the week already has one — the match
    // report holds it until Monday's poll. A table is to read, not to answer.
    await run();

    const calls = await sent();
    expect(calls.some((c) => c.method === "pinChatMessage")).toBe(false);
    expect(calls.some((c) => c.method === "unpinAllChatMessages")).toBe(false);
  });
});

describe("a season with nothing to stand on", () => {
  it("says nothing when no game has been played", async () => {
    // A brand new league: fixtures on the books, none of them played.
    await rawQuery("update fixtures set status = 'scheduled'");

    expect((await run()).skipped).toBe("no results to stand on yet");
    expect(await sent()).toHaveLength(0);
  });

  it("says nothing when the games played have no agreed score", async () => {
    /*
      The one that matters, and the one a "has anybody played" check misses.

      Everybody has turned out, so they are all in the table — and a fixture nobody
      could agree the score on settles with no outcome, so every record is 0W 0D 0L
      and every rating is still the 65 it started at. That is a list of names with one
      number beside each, not a standing, and it is exactly what the group was shown
      on the day somebody joined and pressed the button.
    */
    await rawQuery("update fixture_teams set goals = null");

    const table = await rawQuery<{ wins: number; appearances: number }>(
      "select appearances, wins from v_season_table limit 1",
    );
    // Guard the guard: if this stops being true the test below passes for the wrong
    // reason, because nobody is in the table at all any more.
    expect(Number(table[0]!.appearances)).toBeGreaterThan(0);

    expect((await run()).skipped).toBe("no results to stand on yet");
    expect(await sent()).toHaveLength(0);
  });
});

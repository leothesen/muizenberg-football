import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as askNights } from "@/app/api/cron/nights/ask/route";
import { GET as resolveNights } from "@/app/api/cron/nights/resolve/route";
import { toggleNightVote } from "@/lib/repo/nights";
import { resetToSeed } from "@/test/db/reset";
import { rawQuery } from "@/test/db/anchors";

/**
 * Monday's poll and Tuesday's booking, run for real.
 *
 * The two crons against the real database, talking to Telegram through the emulator
 * transport, which writes every call it is handed to `telegram_emulator_messages`.
 * Reading that table back is reading exactly what the group would have been sent.
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

async function run(cron: (request: Request) => Promise<Response>) {
  const response = await cron(new Request("http://localhost/api/cron"));
  expect(response.status).toBe(200);
  return (await response.json()) as { week: string; messageId?: number };
}

/** Every Telegram call made to one message, oldest first. */
async function callsTo(messageId: number) {
  return rawQuery<{ method: string; params: Record<string, unknown> }>(
    "select method, params from telegram_emulator_messages where target_message_id = $1 order by id",
    [messageId],
  );
}

describe("booking the night", () => {
  it("closes the poll: no buttons left, says so, and keeps the final count", async () => {
    const asked = await run(askNights);
    expect(asked.messageId).toBeTruthy();

    const [first, second] = await rawQuery<{ id: string }>(
      "select id from players order by id limit 2",
    );
    await toggleNightVote({ weekStart: asked.week, playerId: first!.id, night: "thu" });
    await toggleNightVote({ weekStart: asked.week, playerId: second!.id, night: "thu" });

    await run(resolveNights);

    // The resolve cron used to leave the poll exactly as it was, buttons live, so late
    // taps kept moving a count on a week that was already booked.
    const edits = (await callsTo(asked.messageId!)).filter((c) => c.method === "editMessageText");
    expect(edits).toHaveLength(1);

    const closed = edits[0]!.params;
    // No reply_markup is how Telegram takes an inline keyboard away.
    expect(closed.reply_markup).toBeUndefined();
    expect(closed.chat_id).toBe(CHAT);
    expect(String(closed.text)).toContain("Poll's closed");
    expect(String(closed.text)).toContain("Thursday 2");
  });

  it("still books and announces a week whose poll never went up", async () => {
    // No poll row means no message to close. That must not stop the week being booked,
    // because a booked week is the one thing this cron is not allowed to skip.
    await run(resolveNights);

    const sent = await rawQuery<{ method: string; params: Record<string, unknown> }>(
      "select method, params from telegram_emulator_messages order by id",
    );
    expect(sent.some((c) => c.method === "editMessageText")).toBe(false);
    expect(sent.some((c) => c.method === "sendMessage" && String(c.params.text).includes("We're on"))).toBe(
      true,
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as askNights } from "@/app/api/cron/nights/ask/route";
import { GET as resolveNights } from "@/app/api/cron/nights/resolve/route";
import { GET as openRsvp } from "@/app/api/cron/rsvp/open/route";
import { scheduleFor } from "@/domain/schedule";
import { ensureFixture } from "@/lib/repo/fixtures";
import { toggleNightVote } from "@/lib/repo/nights";
import { resetToSeed } from "@/test/db/reset";
import { loadAnchors, rawQuery } from "@/test/db/anchors";

/**
 * Sunday's poll and Monday's booking, run for real.
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
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

interface CronBody {
  week: string;
  messageId?: number;
  squadMessageId?: number | null;
  skipped?: string;
  fixtureId?: string;
  weeknight?: { night: string; kickoffAt: string };
}

async function run(cron: (request: Request) => Promise<Response>) {
  const response = await cron(new Request("http://localhost/api/cron"));
  expect(response.status).toBe(200);
  return (await response.json()) as CronBody;
}

/** Run a cron as though the clock read `at`. Only Date is faked; the driver's timers are real. */
async function runAt(at: Date, cron: (request: Request) => Promise<Response>) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  try {
    return await run(cron);
  } finally {
    vi.useRealTimers();
  }
}

/** Every call of one method, oldest first. */
async function callsOf(method: string) {
  return rawQuery<{ id: number; target_message_id: number | null; params: Record<string, unknown> }>(
    // Cast: bigint columns come back from pg as strings, and message ids are numbers.
    "select id::int as id, target_message_id::int as target_message_id, params from telegram_emulator_messages where method = $1 order by id",
    [method],
  );
}

async function fixtureAt(kickoffAt: string) {
  const [row] = await rawQuery<{ id: string; status: string; rsvp_message_id: number | null }>(
    "select id, status, rsvp_message_id::int as rsvp_message_id from fixtures where kickoff_at = $1",
    [kickoffAt],
  );
  return row!;
}

/** The seed leaves fixtures open, and the earliest open one is what rsvp/open reads. */
async function onlyTheWeekUnderTest() {
  await rawQuery("update fixtures set status = 'played' where status <> 'played'");
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

/*
  One fixed week, so the clock decides nothing. The poll goes up at 17:00 on Sunday 20
  September, the booking runs at 17:00 on Monday 21st, and every squad list goes up
  at 17:00 the day before its game.
*/
const SUNDAY_1700 = new Date("2026-09-20T15:00:00Z");
const MONDAY_1700 = new Date("2026-09-21T15:00:00Z");

/** Ask on Sunday, vote, and book on Monday. */
async function bookTheWeek(night: string) {
  const asked = await runAt(SUNDAY_1700, askNights);
  const [first] = await rawQuery<{ id: string }>("select id from players order by id limit 1");
  await toggleNightVote({ weekStart: asked.week, playerId: first!.id, night });
  const resolved = await runAt(MONDAY_1700, resolveNights);
  return { asked, resolved };
}

async function unplayedFixtures() {
  return rawQuery<{ kickoff_at: string }>(
    "select kickoff_at::text from fixtures where status <> 'played' order by kickoff_at",
  );
}

describe("asking who's in", () => {
  beforeEach(onlyTheWeekUnderTest);

  it("votes from the Sunday and the Monday land in the same poll", async () => {
    const asked = await runAt(SUNDAY_1700, askNights);
    expect(asked.week).toBe("2026-09-21");
    const resolved = await runAt(MONDAY_1700, resolveNights);
    expect(resolved.week).toBe("2026-09-21");
    expect(resolved.skipped).toBeUndefined();
  });

  it("posts a Tuesday's list straight after Monday's booking, and pins it", async () => {
    const { asked, resolved } = await bookTheWeek("tue");

    // The day before a Tuesday is the booking itself. Under the old Tuesday-morning
    // booking this list had three hours before the sides were picked at lunchtime.
    const squadId = resolved.squadMessageId;
    expect(squadId).toEqual(expect.any(Number));

    const [announcement] = (await callsOf("sendMessage")).filter((c) =>
      String(c.params.text).includes("We're on"),
    );
    const squad = (await callsOf("sendMessage")).find((c) => c.id === squadId)!;
    // After the announcement, so the group reads the result and then the question.
    expect(squad.id).toBeGreaterThan(announcement!.id);
    expect(String(squad.params.text)).toContain("IN —");
    expect(String(announcement!.params.text)).not.toContain("In or out goes up");

    const fixture = await fixtureAt(resolved.weeknight!.kickoffAt);
    expect(JSON.stringify(squad.params.reply_markup)).toContain(fixture.id);
    // Attached, which is what every RSVP edits in place and what rsvp/open checks.
    expect(fixture.rsvp_message_id).toBe(squadId);
    expect(fixture.status).toBe("open");

    // Sunday's poll took the pin first and the list takes it off again: the question
    // has changed from "when" to "are you in", and the top of the chat follows.
    const pins = await callsOf("pinChatMessage");
    expect(pins.map((p) => p.target_message_id)).toEqual([asked.messageId, squadId]);

    // Cleared before each one, because the Bot API will not say what is pinned and a
    // board nobody clears is how last week's game ended up at the top on a Monday.
    expect(await callsOf("unpinAllChatMessages")).toHaveLength(2);

    // And the daily cron, running at the same minute, adds nothing.
    const again = await runAt(MONDAY_1700, openRsvp);
    expect(again.skipped).toBe("poll already posted");
  });

  it("holds a Thursday's list until 17:00 on the Wednesday", async () => {
    const { asked, resolved } = await bookTheWeek("thu");

    expect(resolved.squadMessageId).toBeNull();
    const [announcement] = (await callsOf("sendMessage")).filter((c) =>
      String(c.params.text).includes("We're on"),
    );
    // Told when to come back, so two days of nothing to tap does not read as forgotten.
    expect(String(announcement!.params.text)).toContain(
      "In or out goes up Wednesday 23 September, 17:00",
    );

    // Tuesday 17:00, and a minute before Wednesday's: too early both times.
    expect((await runAt(new Date("2026-09-22T15:00:00Z"), openRsvp)).skipped).toBe(
      "too early to ask",
    );
    expect((await runAt(new Date("2026-09-23T14:59:00Z"), openRsvp)).skipped).toBe(
      "too early to ask",
    );

    // Wednesday 17:00.
    const opened = await runAt(new Date("2026-09-23T15:00:00Z"), openRsvp);
    expect(opened.messageId).toEqual(expect.any(Number));
    const fixture = await fixtureAt(resolved.weeknight!.kickoffAt);
    expect(opened.fixtureId).toBe(fixture.id);
    expect(fixture.rsvp_message_id).toBe(opened.messageId);

    const pins = await callsOf("pinChatMessage");
    expect(pins.map((p) => p.target_message_id)).toEqual([asked.messageId, opened.messageId]);

    // And only once.
    const again = await runAt(new Date("2026-09-23T15:05:00Z"), openRsvp);
    expect(again.skipped).toBe("poll already posted");
  });

  it("never books the usual Wednesday ahead of the night the group voted for", async () => {
    // rsvp/open runs every day, including at the minute Monday's booking does. It
    // used to book the usual night whenever nothing was on the books — so a Monday
    // run put a Wednesday ahead of the Thursday the group then voted for, and on the
    // Tuesday that Wednesday got a squad list of its own.
    expect((await runAt(MONDAY_1700, openRsvp)).skipped).toBe("too early to ask");
    expect(await unplayedFixtures()).toHaveLength(0);

    const { resolved } = await bookTheWeek("thu");
    await runAt(new Date("2026-09-22T15:00:00Z"), openRsvp);

    const left = await unplayedFixtures();
    expect(left).toHaveLength(1);
    expect(new Date(left[0]!.kickoff_at).toISOString()).toBe(resolved.weeknight!.kickoffAt);
  });

  it("still books the usual night the day before it, if the booking never ran", async () => {
    // The fallback this cron exists for. No poll, no booking: Tuesday 17:00 is the
    // day before the usual Wednesday, and the group is asked about that.
    const opened = await runAt(new Date("2026-09-22T15:00:00Z"), openRsvp);
    expect(opened.messageId).toEqual(expect.any(Number));
    expect(await unplayedFixtures()).toHaveLength(1);
  });
});

describe("a week booked before this change", () => {
  /*
    The week this change ships in may already have a fixture on the books with no
    squad list. rsvp/open has to post it at 17:00 the day before.
  */
  const WEDNESDAY_1730 = new Date("2026-09-23T15:30:00Z");

  beforeEach(async () => {
    // Anchors first: they read an unplayed fixture, which is about to stop existing.
    const { seasonId } = await loadAnchors();
    await onlyTheWeekUnderTest();
    await ensureFixture({
      seasonId,
      kickoffAt: WEDNESDAY_1730,
      rsvpClosesAt: scheduleFor(WEDNESDAY_1730).rsvpClosesAt,
    });
  });

  it("gets its list at 17:00 the day before, and not before", async () => {
    // Tuesday 16:00, when it used to go up: too early now.
    const early = await runAt(new Date("2026-09-22T14:00:00Z"), openRsvp);
    expect(early.skipped).toBe("too early to ask");
    expect(await callsOf("sendMessage")).toHaveLength(0);

    // Tuesday 17:00.
    const afternoon = await runAt(new Date("2026-09-22T15:00:00Z"), openRsvp);
    expect(afternoon.messageId).toEqual(expect.any(Number));

    const fixture = await fixtureAt(WEDNESDAY_1730.toISOString());
    expect(afternoon.fixtureId).toBe(fixture.id);
    expect(fixture.rsvp_message_id).toBe(afternoon.messageId);
    expect((await callsOf("pinChatMessage")).map((p) => p.target_message_id)).toEqual([
      afternoon.messageId,
    ]);
  });
});

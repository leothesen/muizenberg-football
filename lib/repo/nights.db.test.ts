import { beforeEach, describe, expect, it } from "vitest";
import { resetToSeed } from "@/test/db/reset";
import { type Anchors, loadAnchors } from "@/test/db/anchors";
import { resolveNights } from "@/domain/nights";
import * as nights from "./nights";

/**
 * Votes on which night to play.
 *
 * Two things here only exist at the database level and cannot be tested anywhere
 * else: the unique constraint that turns a second tap into a toggle rather than a
 * second vote, and the primary key on night_polls that stops a cron firing twice from
 * putting two polls in the group, each showing half the tally.
 */

const WEEK = "2026-09-14";

let anchors: Anchors;

beforeEach(async () => {
  await resetToSeed();
  anchors = await loadAnchors();
});

describe("toggleNightVote", () => {
  it("records a vote", async () => {
    const result = await nights.toggleNightVote({
      weekStart: WEEK,
      playerId: anchors.playerId,
      night: "wed",
    });

    expect(result.voted).toBe(true);
    expect(await nights.votesForWeek(WEEK)).toHaveLength(1);
  });

  it("takes the vote back when the same night is tapped again", async () => {
    // One button has to mean both things: the keyboard has a row per night and no
    // room for an undo, and a vote you cannot withdraw is one people hesitate to cast.
    const params = { weekStart: WEEK, playerId: anchors.playerId, night: "wed" };

    await nights.toggleNightVote(params);
    const second = await nights.toggleNightVote(params);

    expect(second.voted).toBe(false);
    expect(await nights.votesForWeek(WEEK)).toHaveLength(0);
  });

  it("lets one person hold several nights at once", async () => {
    // "I can do Wednesday or Thursday" is the commonest honest answer, and a schema
    // that forced a single choice would split it and pick a worse night than either.
    await nights.toggleNightVote({ weekStart: WEEK, playerId: anchors.playerId, night: "wed" });
    await nights.toggleNightVote({ weekStart: WEEK, playerId: anchors.playerId, night: "thu" });

    const votes = await nights.votesForWeek(WEEK);
    expect(votes.map((v) => v.night).sort()).toEqual(["thu", "wed"]);
  });

  it("keeps two people's votes for the same night apart", async () => {
    await nights.toggleNightVote({ weekStart: WEEK, playerId: anchors.playerId, night: "wed" });
    await nights.toggleNightVote({
      weekStart: WEEK,
      playerId: anchors.otherPlayerId,
      night: "wed",
    });

    // The unique constraint is on (week, player, night). If it were on (week, night)
    // the second voter would silently toggle the first one's vote off, and a busy
    // night would tally as one.
    expect(await nights.votesForWeek(WEEK)).toHaveLength(2);
    expect(resolveNights(await nights.votesForWeek(WEEK)).weeknight.key).toBe("wed");
  });

  it("keeps last week's votes out of this week's tally", async () => {
    await nights.toggleNightVote({
      weekStart: "2026-09-07",
      playerId: anchors.playerId,
      night: "thu",
    });

    expect(await nights.votesForWeek(WEEK)).toHaveLength(0);
    expect(await nights.votesForWeek("2026-09-07")).toHaveLength(1);
  });
});

describe("claimNightPoll", () => {
  it("claims the week for the first message posted", async () => {
    const { created } = await nights.claimNightPoll({
      weekStart: WEEK,
      chatId: -100123,
      messageId: 42,
    });

    expect(created).toBe(true);
    expect(await nights.nightPoll(WEEK)).toMatchObject({ message_id: 42 });
  });

  it("refuses a second poll for the same week", async () => {
    // Two polls in the chat would each show half the votes and neither would be
    // right. The loser deletes the message it just sent, which it can only do if it
    // is told it lost.
    await nights.claimNightPoll({ weekStart: WEEK, chatId: -100123, messageId: 42 });
    const second = await nights.claimNightPoll({
      weekStart: WEEK,
      chatId: -100123,
      messageId: 43,
    });

    expect(second.created).toBe(false);
    // The first message stays the one the tally is edited into.
    expect(await nights.nightPoll(WEEK)).toMatchObject({ message_id: 42 });
  });
});

describe("markNightsResolved", () => {
  it("records that the week has been turned into fixtures", async () => {
    // The guard against a retry booking the same week twice — the same idempotency
    // the RSVP poll gets from rsvp_message_id.
    await nights.claimNightPoll({ weekStart: WEEK, chatId: -100123, messageId: 42 });
    expect((await nights.nightPoll(WEEK))?.resolved_at).toBeNull();

    await nights.markNightsResolved(WEEK);
    expect((await nights.nightPoll(WEEK))?.resolved_at).not.toBeNull();
  });
});

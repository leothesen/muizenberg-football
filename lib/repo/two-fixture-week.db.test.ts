import { beforeEach, describe, expect, it } from "vitest";
import { resetToSeed } from "@/test/db/reset";
import { loadAnchors, rawQuery } from "@/test/db/anchors";
import { defaultNightFrom } from "@/domain/nights";
import * as fixtures from "./fixtures";

/**
 * A week with two games in it.
 *
 * The night vote can book a weeknight fixture and a weekend one in the same week, and
 * every cron still selects a single fixture. That works — but only because the
 * selectors order by kickoff and a fixture's status advances as its evening passes,
 * which is a property of three separate functions agreeing rather than anything
 * anybody designed. It was asserted before it was tested, so here it is tested.
 *
 * The failure this guards against is quiet and bad: the Saturday game silently never
 * gets a poll because the Wednesday one keeps winning the selector, and the first
 * anybody knows is nobody turning up on Saturday.
 */

const WEDNESDAY = new Date("2026-10-14T16:00:00Z");
const SATURDAY = new Date("2026-10-17T15:00:00Z");

let seasonId: string;

beforeEach(async () => {
  await resetToSeed();
  const anchors = await loadAnchors();
  seasonId = anchors.seasonId;

  // Everything the seed leaves open would otherwise outrank both of these.
  await rawQuery("update fixtures set status = 'played' where status <> 'played'");
});

async function bookBoth() {
  const midweek = await fixtures.ensureFixture({
    seasonId,
    kickoffAt: WEDNESDAY,
    rsvpClosesAt: new Date("2026-10-14T10:00:00Z"),
  });
  const weekend = await fixtures.ensureFixture({
    seasonId,
    kickoffAt: SATURDAY,
    rsvpClosesAt: new Date("2026-10-17T09:00:00Z"),
  });

  return { midweek: midweek.fixture, weekend: weekend.fixture };
}

describe("a week with a weeknight and a weekend game", () => {
  it("books both without collision", async () => {
    const { midweek, weekend } = await bookBoth();
    expect(midweek.id).not.toBe(weekend.id);
  });

  it("works on the nearer game first", async () => {
    const { midweek } = await bookBoth();
    expect((await fixtures.openFixture())?.id).toBe(midweek.id);
  });

  it("moves to the weekend game once the midweek one is locked", async () => {
    // The whole two-fixture week depends on this. If openFixture kept returning the
    // Wednesday game after its teams were picked, the Saturday one would never get a
    // poll and the first anybody would know is nobody turning up.
    const { midweek, weekend } = await bookBoth();
    await fixtures.setFixtureStatus(midweek.id, "locked");

    expect((await fixtures.openFixture())?.id).toBe(weekend.id);
  });

  it("still reaches the locked midweek game, which is where the weather lands", async () => {
    // upcomingFixture includes `locked` precisely because the hours between picking
    // sides and kicking off are when a game gets rained off.
    const { midweek } = await bookBoth();
    await fixtures.setFixtureStatus(midweek.id, "locked");

    expect((await fixtures.upcomingFixture())?.id).toBe(midweek.id);
  });

  it("asks for reports on the game that has actually finished", async () => {
    const { midweek, weekend } = await bookBoth();
    await fixtures.setFixtureStatus(midweek.id, "locked");
    await fixtures.setFixtureStatus(weekend.id, "locked");

    // Thursday morning: the Wednesday game is over, the Saturday one has not started.
    const thursday = new Date("2026-10-15T06:00:00Z");
    expect((await fixtures.fixtureAwaitingReports(thursday))?.id).toBe(midweek.id);
  });

  it("does not let a weekend game become the league's default night", async () => {
    // A Saturday game does not make Saturday the league night. If it did, one
    // weekend kickabout would rewrite the default every silent week after it.
    await bookBoth();

    // A fixture nobody has played yet says nothing about the group's habit.
    const scheduled = await fixtures.recentKickoffs();
    expect(scheduled.map((d) => d.toISOString())).not.toContain(SATURDAY.toISOString());

    // Once both have been played the Saturday is the most recent game of all, and the
    // default still has to read the Wednesday.
    await rawQuery("update fixtures set status = 'played' where kickoff_at >= $1", [
      WEDNESDAY.toISOString(),
    ]);

    const played = await fixtures.recentKickoffs();
    expect(played[0]!.toISOString()).toBe(SATURDAY.toISOString());
    expect(defaultNightFrom(played).key).toBe("wed");
  });
});

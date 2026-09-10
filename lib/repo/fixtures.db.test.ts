import { beforeEach, describe, expect, it } from "vitest";
import { resetToSeed } from "@/test/db/reset";
import { stable } from "@/test/db/normalise";
import { type Anchors, loadAnchors, rawQuery } from "@/test/db/anchors";
import * as fixtures from "./fixtures";

/**
 * Seasons and fixtures.
 *
 * `ensureFixture` is the one the Tuesday cron leans on. It is unique by kickoff at
 * the database level, and the cron calls it every week whether or not a fixture
 * already exists — so a port that lost the uniqueness would post two polls to the
 * group, and one that lost the "already exists" path would create a duplicate
 * fixture every retry.
 */

let anchors: Anchors;

beforeEach(async () => {
  await resetToSeed();
  anchors = await loadAnchors();
});

describe("currentSeason and ensureSeason", () => {
  it("currentSeason finds the open season", async () => {
    const season = await fixtures.currentSeason();
    expect(season).not.toBeNull();
    expect(stable(season)).toMatchSnapshot();
  });

  it("ensureSeason returns the existing season rather than opening a second", async () => {
    const before = await fixtures.currentSeason();
    const ensured = await fixtures.ensureSeason(
      new Date("2026-09-09T16:00:00Z"),
    );

    expect(ensured.id).toBe(before!.id);

    const [count] = await rawQuery<{ n: string }>(
      "select count(*) as n from seasons",
    );
    expect(count!.n).toBe("1");
  });
});

describe("reading fixtures", () => {
  it("fixtureById", async () => {
    expect(
      stable(await fixtures.fixtureById(anchors.playedFixtureId)),
    ).toMatchSnapshot();
  });

  it("fixtureById returns null for an unknown id", async () => {
    expect(
      await fixtures.fixtureById("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });

  it("fixtureByKickoff finds by exact instant", async () => {
    const [row] = await rawQuery<{ kickoff_at: Date }>(
      "select kickoff_at from fixtures order by kickoff_at limit 1",
    );

    const found = await fixtures.fixtureByKickoff(new Date(row!.kickoff_at));
    expect(found).not.toBeNull();
    expect(stable(found)).toMatchSnapshot();
  });

  it("fixtureByKickoff returns null a second off", async () => {
    const [row] = await rawQuery<{ kickoff_at: Date }>(
      "select kickoff_at from fixtures order by kickoff_at limit 1",
    );

    const offByOne = new Date(new Date(row!.kickoff_at).getTime() + 1000);
    expect(await fixtures.fixtureByKickoff(offByOne)).toBeNull();
  });

  it("openFixture finds the fixture taking RSVPs", async () => {
    // The seed leaves next week's fixture already open, so the demo has a poll to
    // answer without waiting for Tuesday.
    const open = await fixtures.openFixture();
    expect(open?.id).toBe(anchors.upcomingFixtureId);
    expect(open?.status).toBe("open");
  });

  it("openFixture is null once the squad is locked", async () => {
    await fixtures.setFixtureStatus(anchors.upcomingFixtureId, "locked");
    expect(await fixtures.openFixture()).toBeNull();
  });
});

describe("ensureFixture", () => {
  const kickoff = new Date("2026-10-07T16:00:00Z");
  const closes = new Date("2026-10-07T10:00:00Z");

  it("creates a fixture that does not exist yet", async () => {
    const { fixture, created } = await fixtures.ensureFixture({
      seasonId: anchors.seasonId,
      kickoffAt: kickoff,
      rsvpClosesAt: closes,
    });

    expect(created).toBe(true);
    expect(new Date(fixture.kickoff_at).toISOString()).toBe(
      kickoff.toISOString(),
    );
  });

  it("is idempotent, which is what stops a second Tuesday poll", async () => {
    const first = await fixtures.ensureFixture({
      seasonId: anchors.seasonId,
      kickoffAt: kickoff,
      rsvpClosesAt: closes,
    });
    const second = await fixtures.ensureFixture({
      seasonId: anchors.seasonId,
      kickoffAt: kickoff,
      rsvpClosesAt: closes,
    });

    expect(second.created).toBe(false);
    expect(second.fixture.id).toBe(first.fixture.id);

    const [count] = await rawQuery<{ n: string }>(
      "select count(*) as n from fixtures where kickoff_at = $1",
      [kickoff.toISOString()],
    );
    expect(count!.n).toBe("1");
  });
});

describe("attachRsvpMessage and setFixtureStatus", () => {
  it("attaches the poll message, which is the other half of the idempotency", async () => {
    await fixtures.attachRsvpMessage(anchors.upcomingFixtureId, -100123, 4242);

    const [row] = await rawQuery<{
      rsvp_message_id: string;
      rsvp_chat_id: string;
    }>("select rsvp_message_id, rsvp_chat_id from fixtures where id = $1", [
      anchors.upcomingFixtureId,
    ]);

    expect(row!.rsvp_message_id).toBe("4242");
    expect(row!.rsvp_chat_id).toBe("-100123");
  });

  it("sets a status", async () => {
    await fixtures.setFixtureStatus(anchors.upcomingFixtureId, "locked");

    const [row] = await rawQuery<{ status: string }>(
      "select status from fixtures where id = $1",
      [anchors.upcomingFixtureId],
    );
    expect(row!.status).toBe("locked");
  });

  it("records a reason when a game is called off", async () => {
    await fixtures.setFixtureStatus(
      anchors.upcomingFixtureId,
      "cancelled",
      "Pitch flooded",
    );

    const [row] = await rawQuery<{ status: string; cancelled_reason: string }>(
      "select status, cancelled_reason from fixtures where id = $1",
      [anchors.upcomingFixtureId],
    );

    expect(row!.status).toBe("cancelled");
    expect(row!.cancelled_reason).toBe("Pitch flooded");
  });
});

describe("fixtureAwaitingReports", () => {
  it("finds a locked fixture once enough time has passed since kickoff", async () => {
    await fixtures.setFixtureStatus(anchors.upcomingFixtureId, "locked");

    const [row] = await rawQuery<{ kickoff_at: Date }>(
      "select kickoff_at from fixtures where id = $1",
      [anchors.upcomingFixtureId],
    );

    const threeHoursAfter = new Date(
      new Date(row!.kickoff_at).getTime() + 3 * 60 * 60 * 1000,
    );

    const awaiting = await fixtures.fixtureAwaitingReports(threeHoursAfter);
    expect(awaiting?.id).toBe(anchors.upcomingFixtureId);
  });

  it("does not ask for reports before the game has finished", async () => {
    await fixtures.setFixtureStatus(anchors.upcomingFixtureId, "locked");

    const [row] = await rawQuery<{ kickoff_at: Date }>(
      "select kickoff_at from fixtures where id = $1",
      [anchors.upcomingFixtureId],
    );

    const oneHourAfter = new Date(
      new Date(row!.kickoff_at).getTime() + 60 * 60 * 1000,
    );

    // Default window is two hours: at one hour they are still playing.
    expect(await fixtures.fixtureAwaitingReports(oneHourAfter)).toBeNull();
  });
});

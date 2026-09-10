import { beforeEach, describe, expect, it } from "vitest";
import { resetToSeed } from "@/test/db/reset";
import { sortRows, stable } from "@/test/db/normalise";
import { type Anchors, loadAnchors, rawQuery } from "@/test/db/anchors";
import * as rsvps from "./rsvps";

/**
 * Who is coming.
 *
 * The waitlist is the subtle part: subs are chosen by who answered last, so
 * `in_since` gives the queue a total order and losing that ordering in the port
 * would silently change who gets a game.
 */

let anchors: Anchors;

beforeEach(async () => {
  await resetToSeed();
  anchors = await loadAnchors();
});

describe("listRsvps and commitmentsFor", () => {
  it("listRsvps", async () => {
    const rows = await rsvps.listRsvps(anchors.upcomingFixtureId);
    expect(rows.length).toBeGreaterThan(0);
    expect(stable(sortRows(rows, "display_name"))).toMatchSnapshot();
  });

  it("commitmentsFor", async () => {
    const commitments = await rsvps.commitmentsFor(anchors.upcomingFixtureId);
    expect(commitments.length).toBeGreaterThan(0);

    // A Commitment is { player, inSince }, and inSince is seeded relative to now()
    // so it cannot be compared directly. The player is what the balancer consumes.
    expect(
      stable(
        [...commitments]
          .map((c) => c.player)
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      ),
    ).toMatchSnapshot();
  });

  it("commitmentsFor orders the waitlist by who said in first", async () => {
    const commitments = await rsvps.commitmentsFor(anchors.upcomingFixtureId);
    const times = commitments.map((c) => c.inSince.getTime());

    // The order is the whole point: subs are whoever replied last. Compared rather
    // than snapshotted, because the values themselves move with the clock.
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("listRsvps is empty for a fixture nobody has answered", async () => {
    const [fresh] = await rawQuery<{ id: string }>(
      `insert into fixtures (season_id, kickoff_at, rsvp_closes_at)
       values ($1, timestamptz '2026-11-04 18:00:00+02', timestamptz '2026-11-04 12:00:00+02')
       returning id`,
      [anchors.seasonId],
    );

    expect(await rsvps.listRsvps(fresh!.id)).toEqual([]);
  });
});

describe("setRsvp", () => {
  it("records a new answer", async () => {
    const [fresh] = await rawQuery<{ id: string }>(
      `insert into fixtures (season_id, kickoff_at, rsvp_closes_at)
       values ($1, timestamptz '2026-11-11 18:00:00+02', timestamptz '2026-11-11 12:00:00+02')
       returning id`,
      [anchors.seasonId],
    );

    await rsvps.setRsvp(fresh!.id, anchors.playerId, "in");

    const [row] = await rawQuery<{ status: string; in_since: Date | null }>(
      "select status, in_since from rsvps where fixture_id = $1 and player_id = $2",
      [fresh!.id, anchors.playerId],
    );

    expect(row!.status).toBe("in");
    // Saying "in" has to stamp the queue position, or the waitlist has no order.
    expect(row!.in_since).not.toBeNull();
  });

  it("changing an answer does not duplicate the row", async () => {
    await rsvps.setRsvp(anchors.upcomingFixtureId, anchors.playerId, "out");
    await rsvps.setRsvp(anchors.upcomingFixtureId, anchors.playerId, "in");

    const [count] = await rawQuery<{ n: string }>(
      "select count(*) as n from rsvps where fixture_id = $1 and player_id = $2",
      [anchors.upcomingFixtureId, anchors.playerId],
    );

    expect(count!.n).toBe("1");
  });

  it("sends somebody to the back of the queue if they drop out and return", async () => {
    await rsvps.setRsvp(anchors.upcomingFixtureId, anchors.playerId, "in");
    const [first] = await rawQuery<{ in_since: Date }>(
      "select in_since from rsvps where fixture_id = $1 and player_id = $2",
      [anchors.upcomingFixtureId, anchors.playerId],
    );

    await rsvps.setRsvp(anchors.upcomingFixtureId, anchors.playerId, "out");

    const [whileOut] = await rawQuery<{ in_since: Date | null }>(
      "select in_since from rsvps where fixture_id = $1 and player_id = $2",
      [anchors.upcomingFixtureId, anchors.playerId],
    );

    await rsvps.setRsvp(anchors.upcomingFixtureId, anchors.playerId, "in");
    const [again] = await rawQuery<{ in_since: Date }>(
      "select in_since from rsvps where fixture_id = $1 and player_id = $2",
      [anchors.upcomingFixtureId, anchors.playerId],
    );

    // Compared rather than snapshotted: in_since comes from now() inside a database
    // trigger, so its value is different every run. The behaviour is the contract —
    // dropping out clears the stamp, and coming back earns a fresh one, which is
    // exactly what "subs are whoever replied last" means.
    expect(whileOut!.in_since).toBeNull();
    expect(new Date(again!.in_since).getTime()).toBeGreaterThanOrEqual(
      new Date(first!.in_since).getTime(),
    );
  });
});

describe("markPromoted", () => {
  it("stamps the players it is given and leaves the rest alone", async () => {
    const before = await rawQuery<{ n: string }>(
      "select count(*) as n from rsvps where fixture_id = $1 and promoted_at is not null",
      [anchors.upcomingFixtureId],
    );

    await rsvps.markPromoted(anchors.upcomingFixtureId, [anchors.playerId]);

    const [promoted] = await rawQuery<{ n: string }>(
      "select count(*) as n from rsvps where fixture_id = $1 and promoted_at is not null",
      [anchors.upcomingFixtureId],
    );

    expect(Number(promoted!.n)).toBe(Number(before[0]!.n) + 1);
  });

  it("does nothing when given nobody", async () => {
    await expect(
      rsvps.markPromoted(anchors.upcomingFixtureId, []),
    ).resolves.toBeUndefined();
  });
});

describe("silentPlayers", () => {
  it("lists active players who have not answered", async () => {
    const silent = await rsvps.silentPlayers(anchors.upcomingFixtureId);
    expect(stable(sortRows(silent, "display_name"))).toMatchSnapshot();
  });

  it("shrinks as people answer", async () => {
    const before = await rsvps.silentPlayers(anchors.upcomingFixtureId);

    const unanswered = before[0];
    if (unanswered) {
      await rsvps.setRsvp(
        anchors.upcomingFixtureId,
        (unanswered as { id: string }).id,
        "in",
      );
      const after = await rsvps.silentPlayers(anchors.upcomingFixtureId);
      expect(after.length).toBe(before.length - 1);
    } else {
      // Everybody in the seed has answered; the nudge cron then has nobody to chase,
      // which is itself the behaviour worth pinning.
      expect(before).toEqual([]);
    }
  });
});

describe("shapeOf", () => {
  it("is pure arithmetic over the fixture's own limits", () => {
    expect(
      rsvps.shapeOf({ players_per_team: 8, subs_per_team: 3 }),
    ).toMatchSnapshot();
  });

  it("scales with a smaller game", () => {
    expect(
      rsvps.shapeOf({ players_per_team: 5, subs_per_team: 1 }),
    ).toMatchSnapshot();
  });
});

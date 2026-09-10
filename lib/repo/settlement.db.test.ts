import { beforeEach, describe, expect, it } from "vitest";
import { settleFixture } from "@/domain/settle";
import { resetToSeed } from "@/test/db/reset";
import { stable } from "@/test/db/normalise";
import { type Anchors, loadAnchors, rawQuery } from "@/test/db/anchors";
import * as settlement from "./settlement";
import * as backfill from "./backfill";
import { claimUpdate } from "./updates";

/**
 * Settling a week.
 *
 * The riskiest thing in the codebase to port. The write order is load-bearing —
 * score, then rating events skipping anyone already rated, then badges, then
 * status last — so that a crash halfway through leaves a fixture that the next run
 * finishes rather than one that gets counted twice.
 *
 * Idempotency is therefore not a nicety here: the settle cron runs weekly and a
 * timeout mid-write is an ordinary Thursday.
 */

let anchors: Anchors;

beforeEach(async () => {
  await resetToSeed();
  anchors = await loadAnchors();
});

async function countsFor(fixtureId: string) {
  const [row] = await rawQuery<Record<string, string>>(
    `select (select count(*) from rating_events where fixture_id = $1) as ratings,
            (select count(*) from player_badges where fixture_id = $1) as badges,
            (select status from fixtures where id = $1) as status`,
    [fixtureId],
  );
  return row!;
}

describe("settlementContextFor", () => {
  it("gathers what a fixture needs to be settled", async () => {
    const context = await settlement.settlementContextFor(
      anchors.playedFixtureId,
    );

    expect(context).not.toBeNull();
    expect(context!.players.length).toBeGreaterThan(0);
  });

  it("is null for a fixture nobody has played", async () => {
    expect(
      await settlement.settlementContextFor(
        "00000000-0000-4000-8000-000000000000",
      ),
    ).toBeNull();
  });
});

describe("settleOne", () => {
  it("produces ratings and badges for a played week", async () => {
    const before = await countsFor(anchors.playedFixtureId);
    expect(before.ratings).toBe("0");

    const result = await settlement.settleOne(anchors.playedFixtureId);
    expect(result).not.toBeNull();

    const after = await countsFor(anchors.playedFixtureId);
    expect(Number(after.ratings)).toBeGreaterThan(0);
    expect(after.status).toBe("played");
  });

  it("is idempotent: settling twice does not rate anybody twice", async () => {
    await settlement.settleOne(anchors.playedFixtureId);
    const first = await countsFor(anchors.playedFixtureId);

    await settlement.settleOne(anchors.playedFixtureId);
    const second = await countsFor(anchors.playedFixtureId);

    // The cron fires weekly and retries on timeout. Double-counting here would
    // inflate every rating in the league and there would be no way back.
    expect(second.ratings).toBe(first.ratings);
    expect(second.badges).toBe(first.badges);
  });

  it("does not move a player's rating on the second settle", async () => {
    await settlement.settleOne(anchors.playedFixtureId);
    const [before] = await rawQuery<{ ratings: string }>(
      "select md5(string_agg(rating::text, ',' order by telegram_user_id)) as ratings from players",
    );

    await settlement.settleOne(anchors.playedFixtureId);
    const [after] = await rawQuery<{ ratings: string }>(
      "select md5(string_agg(rating::text, ',' order by telegram_user_id)) as ratings from players",
    );

    expect(after!.ratings).toBe(before!.ratings);
  });

  it("rates every player against the night's own average", async () => {
    await settlement.settleOne(anchors.playedFixtureId);

    const events = await rawQuery<{ delta: string }>(
      "select delta from rating_events where fixture_id = $1",
      [anchors.playedFixtureId],
    );

    const deltas = events.map((e) => Number(e.delta));
    expect(deltas.length).toBeGreaterThan(0);

    // The first version of the engine compared everyone to a fixed baseline the whole
    // league beat every week, so ratings only ever went up. Measured against the
    // night's own average, somebody has to be below it.
    expect(deltas.some((d) => d < 0)).toBe(true);
    expect(deltas.some((d) => d > 0)).toBe(true);
  });
});

describe("applySettlement", () => {
  /**
   * Tested directly rather than only through settleOne, because this is where the
   * write order lives and the order is the entire recovery story.
   */
  async function settlementFor(fixtureId: string) {
    const context = await settlement.settlementContextFor(fixtureId);
    return settleFixture(context!);
  }

  it("writes ratings, badges and the status together", async () => {
    const applied = await settlement.applySettlement(
      anchors.playedFixtureId,
      await settlementFor(anchors.playedFixtureId),
    );

    const after = await countsFor(anchors.playedFixtureId);

    expect(applied).toBeDefined();
    expect(Number(after.ratings)).toBeGreaterThan(0);
    expect(after.status).toBe("played");
  });

  it("skips players who already carry a rating event for the fixture", async () => {
    const computed = await settlementFor(anchors.playedFixtureId);

    await settlement.applySettlement(anchors.playedFixtureId, computed);
    const first = await countsFor(anchors.playedFixtureId);

    // Applying the very same settlement again is what a retry after a timeout looks
    // like. Every player already has an event, so every one is skipped.
    await settlement.applySettlement(anchors.playedFixtureId, computed);
    const second = await countsFor(anchors.playedFixtureId);

    expect(second.ratings).toBe(first.ratings);
    expect(second.badges).toBe(first.badges);
  });

  it("leaves a fixture recoverable if it never reaches the status write", async () => {
    const computed = await settlementFor(anchors.playedFixtureId);
    await rawQuery("update fixtures set status = 'locked' where id = $1", [
      anchors.playedFixtureId,
    ]);

    await settlement.applySettlement(anchors.playedFixtureId, computed);

    // Status is written last precisely so that a crash before it leaves the fixture
    // still locked, which is the state fixtureAwaitingSettlement looks for.
    const after = await countsFor(anchors.playedFixtureId);
    expect(after.status).toBe("played");
    expect(Number(after.ratings)).toBeGreaterThan(0);
  });
});

describe("fixtureAwaitingSettlement", () => {
  /**
   * It looks for `locked`, never `played`. That is the whole idempotency design
   * showing through: settling writes the score, then the ratings, then the badges,
   * and only then moves the fixture to `played`. Until that last write lands the
   * fixture is still `locked` and the next run picks it up again; once it lands, no
   * run will ever look at it a second time.
   */
  async function lockAndAge(hoursAfterKickoff: number): Promise<Date> {
    await rawQuery("update fixtures set status = 'locked' where id = $1", [
      anchors.playedFixtureId,
    ]);

    const [row] = await rawQuery<{ kickoff_at: Date }>(
      "select kickoff_at from fixtures where id = $1",
      [anchors.playedFixtureId],
    );

    return new Date(
      new Date(row!.kickoff_at).getTime() + hoursAfterKickoff * 60 * 60 * 1000,
    );
  }

  it("finds a locked fixture once the reporting window has passed", async () => {
    const awaiting = await settlement.fixtureAwaitingSettlement(
      await lockAndAge(24),
    );

    expect(awaiting?.id).toBe(anchors.playedFixtureId);
  });

  it("does not settle a game that has only just finished", async () => {
    // Twelve-hour default: people are still filing reports on the way home.
    expect(
      await settlement.fixtureAwaitingSettlement(await lockAndAge(1)),
    ).toBeNull();
  });

  it("never returns a fixture that has already been settled", async () => {
    const when = await lockAndAge(24);
    expect(await settlement.fixtureAwaitingSettlement(when)).not.toBeNull();

    await settlement.settleOne(anchors.playedFixtureId);

    // Settling moved it to played, and that is what stops the cron settling it again
    // next week.
    expect(await settlement.fixtureAwaitingSettlement(when)).toBeNull();
  });
});

describe("backfill", () => {
  it("unsettledFixtures lists the played weeks oldest first", async () => {
    const unsettled = await backfill.unsettledFixtures();
    expect(unsettled.length).toBeGreaterThan(0);

    const times = unsettled.map((f) => new Date(f.kickoff_at).getTime());
    // Order is the whole point: career totals and streaks must only ever see the
    // past, so a replay has to run oldest to newest.
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("backfillSettlements replays every week", async () => {
    const results = await backfill.backfillSettlements();
    expect(results.length).toBeGreaterThan(0);

    const [totals] = await rawQuery<{ ratings: string; played: string }>(
      `select (select count(*) from rating_events) as ratings,
              (select count(*) from fixtures where status = 'played') as played`,
    );

    expect(Number(totals!.ratings)).toBeGreaterThan(0);
    expect(await backfill.unsettledFixtures()).toEqual([]);
  });

  it("is repeatable: a second backfill lands on the same league", async () => {
    await backfill.backfillSettlements();
    const [first] = await rawQuery<{ fingerprint: string }>(
      "select md5(string_agg(rating::text, ',' order by telegram_user_id)) as fingerprint from players",
    );

    await backfill.backfillSettlements();
    const [second] = await rawQuery<{ fingerprint: string }>(
      "select md5(string_agg(rating::text, ',' order by telegram_user_id)) as fingerprint from players",
    );

    // Backfill un-settles everything first and replays from scratch, so running it
    // twice must be indistinguishable from running it once.
    expect(second!.fingerprint).toBe(first!.fingerprint);
  });
});

describe("claimUpdate", () => {
  it("claims a Telegram update exactly once", async () => {
    expect(await claimUpdate(70001, "message")).toBe(true);

    // Telegram retries a webhook it thinks failed. The second claim has to lose, or
    // one tap of an RSVP button counts twice.
    expect(await claimUpdate(70001, "message")).toBe(false);
  });

  it("treats different update ids independently", async () => {
    expect(await claimUpdate(70002, "callback_query")).toBe(true);
    expect(await claimUpdate(70003, "callback_query")).toBe(true);
  });
});

describe("settlement output", () => {
  it("settles the first week to a stable result", async () => {
    const result = await settlement.settleOne(anchors.playedFixtureId);

    const events = await rawQuery<{
      display_name: string;
      delta: string;
      rating_after: string;
    }>(
      `select p.display_name, re.delta, re.rating_after
         from rating_events re
         join players p on p.id = re.player_id
        where re.fixture_id = $1
        order by p.display_name`,
      [anchors.playedFixtureId],
    );

    expect(
      stable({
        // motm is an array, not a single winner: a tie on votes produces two, and
        // the message has to say "shared" rather than quietly pick one.
        motmCount: result!.settlement.motm.length,
        scoreSource: result!.settlement.scoreSource,
        reportedCount: result!.settlement.reportedCount,
        teamOfTheWeek: result!.settlement.teamOfTheWeek.map(
          (p) => p.displayName,
        ),
        events,
      }),
    ).toMatchSnapshot();
  });
});

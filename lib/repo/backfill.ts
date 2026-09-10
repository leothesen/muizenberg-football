import { asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { fixtures, ratingEvents } from "@/lib/db/schema";
import { settleOne } from "./settlement";

/**
 * Running the fantasy engine over history.
 *
 * A league that arrives with games already played — the seeded demo season, or a real
 * one where the bot showed up late — has results but no ratings, no badges and no
 * form. This walks those fixtures through the ordinary settlement path so the
 * history looks exactly as it would have if the bot had been there all along.
 *
 * The trick that makes it correct is unsettling everything first. Career totals and
 * streaks are read from fixtures marked `played`, so leaving later games settled
 * while backfilling an earlier one would let August's badges be decided by what
 * happened in September. Setting them all back to `locked` and replaying in order
 * means every fixture sees only the past.
 */

export interface BackfillResult {
  fixtureId: string;
  kickoffAt: string;
  rated: number;
  badgesAwarded: number;
  reported: number;
  score: { a: number; b: number } | null;
}

/**
 * Played fixtures the rating engine has never seen.
 *
 * Only `played` ones. A `locked` fixture is a game whose teams are out but which may
 * not have kicked off yet, and settling it here would decide a result before anyone
 * had taken the field — that is the settle cron's job, and it waits.
 */
export async function unsettledFixtures(): Promise<
  { id: string; kickoff_at: string }[]
> {
  const played = await db()
    .select({ id: fixtures.id, kickoff_at: fixtures.kickoff_at })
    .from(fixtures)
    .where(eq(fixtures.status, "played"))
    .orderBy(asc(fixtures.kickoff_at));

  const rated = await db()
    .select({ fixture_id: ratingEvents.fixture_id })
    .from(ratingEvents)
    .where(isNotNull(ratingEvents.fixture_id));

  const settled = new Set(
    rated
      .map((row) => row.fixture_id)
      .filter((id): id is string => Boolean(id)),
  );

  return played.filter((f) => !settled.has(f.id));
}

export async function backfillSettlements(): Promise<BackfillResult[]> {
  const pending = await unsettledFixtures();
  if (pending.length === 0) return [];

  // Everything goes back to `locked` before anything is replayed, so that each
  // fixture is settled against a league that only knows about earlier games.
  await db()
    .update(fixtures)
    .set({ status: "locked" })
    .where(
      inArray(
        fixtures.id,
        pending.map((f) => f.id),
      ),
    );

  const results: BackfillResult[] = [];

  for (const fixture of pending) {
    const outcome = await settleOne(fixture.id);

    if (!outcome) {
      // No team sheet, so there is nothing to settle. Put it back rather than
      // leaving it stuck in `locked`, where the RSVP crons would trip over it.
      await db()
        .update(fixtures)
        .set({ status: "played" })
        .where(eq(fixtures.id, fixture.id));
      continue;
    }

    results.push({
      fixtureId: fixture.id,
      kickoffAt: fixture.kickoff_at,
      rated: outcome.applied.rated,
      badgesAwarded: outcome.applied.badgesAwarded,
      reported: outcome.settlement.reportedCount,
      score: outcome.settlement.score,
    });
  }

  return results;
}

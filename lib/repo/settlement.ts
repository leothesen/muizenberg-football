import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import {
  settleFixture,
  type Settlement,
  type SettlementContext,
  type SettlementPlayer,
  type SubmittedReport,
} from "@/domain/settle";
import type { Side } from "@/domain/types";
import { db } from "@/lib/db";
import {
  fixtureTeams,
  fixtures,
  playerBadges,
  players,
  ratingEvents,
  rsvps,
  teamPlayers,
} from "@/lib/db/schema";
import { badgesHeldBy, careerTotals, currentStreaks } from "./stats";
import { submittedReports } from "./reports";

/**
 * Persisting a settled fixture.
 *
 * The whole operation has to be safe to run twice, because a cron that times out
 * halfway is not a hypothetical. Three things make that true:
 *
 * - the fixture is only marked `played` at the very end, so a crash leaves it
 *   `locked` and the next run picks it up again;
 * - a player who already has a rating event for this fixture is skipped entirely,
 *   which is what stops a retry applying the same delta twice;
 * - badges are inserted ignoring conflicts, since a badge is earned once.
 *
 * The ordering is doing the work a transaction otherwise would. It could now be
 * wrapped in one — unlike PostgREST, this driver has transactions — but that would
 * change the recovery model from "finish it next time" to "all or nothing", and
 * the ordering is what the tests and the cron are written against.
 */

interface SelectedRow {
  playerId: string;
  side: Side;
  isSub: boolean;
}

/** Everything the pure settlement needs, read out of the database. */
export async function settlementContextFor(
  fixtureId: string,
): Promise<SettlementContext | null> {
  const selected = await selectedForFixture(fixtureId);
  if (selected.length === 0) return null;

  const playerIds = selected.map((s) => s.playerId);

  const [
    profiles,
    reports,
    careerBefore,
    streakBefore,
    badgesHeld,
    rsvpInfo,
    recordedScore,
  ] = await Promise.all([
    playerProfiles(playerIds),
    submittedReportsFor(fixtureId),
    careerTotals(),
    currentStreaks(),
    badgesHeldBy(playerIds),
    rsvpFacts(fixtureId),
    recordedScoreFor(fixtureId),
  ]);

  const settlementPlayers: SettlementPlayer[] = selected.map((row) => {
    const profile = profiles.get(row.playerId);
    return {
      playerId: row.playerId,
      displayName: profile?.displayName ?? "Someone",
      emoji: profile?.emoji ?? "⚽",
      rating: profile?.rating ?? 65,
      side: row.side,
      isSub: row.isSub,
    };
  });

  return {
    players: settlementPlayers,
    reports,
    careerBefore,
    streakBefore,
    badgesHeld,
    firstToRespondPlayerId: rsvpInfo.firstToRespondPlayerId,
    promotedPlayerIds: rsvpInfo.promotedPlayerIds,
    recordedScore,
  };
}

/**
 * A score already sitting on the fixture. Normally null — the settlement is what puts
 * it there — but a replayed fixture may have had one written by hand or by a seed.
 */
async function recordedScoreFor(
  fixtureId: string,
): Promise<{ a: number; b: number } | null> {
  const rows = await db()
    .select({ side: fixtureTeams.side, goals: fixtureTeams.goals })
    .from(fixtureTeams)
    .where(eq(fixtureTeams.fixture_id, fixtureId));

  const a = rows.find((row) => row.side === "a")?.goals;
  const b = rows.find((row) => row.side === "b")?.goals;

  if (a === null || a === undefined || b === null || b === undefined)
    return null;
  return { a, b };
}

async function selectedForFixture(fixtureId: string): Promise<SelectedRow[]> {
  const rows = await db()
    .select({
      player_id: teamPlayers.player_id,
      is_sub: teamPlayers.is_sub,
      side: fixtureTeams.side,
    })
    .from(teamPlayers)
    .innerJoin(fixtureTeams, eq(fixtureTeams.id, teamPlayers.fixture_team_id))
    .where(eq(teamPlayers.fixture_id, fixtureId));

  const selected: SelectedRow[] = [];
  for (const row of rows) {
    if (row.side !== "a" && row.side !== "b") continue;
    selected.push({
      playerId: row.player_id,
      side: row.side,
      isSub: row.is_sub,
    });
  }
  return selected;
}

interface Profile {
  displayName: string;
  emoji: string;
  rating: number;
}

async function playerProfiles(
  playerIds: string[],
): Promise<Map<string, Profile>> {
  if (playerIds.length === 0) return new Map();

  const rows = await db()
    .select({
      id: players.id,
      display_name: players.display_name,
      emoji: players.emoji,
      rating: players.rating,
    })
    .from(players)
    .where(inArray(players.id, playerIds));

  return new Map(
    rows.map((row) => [
      row.id,
      {
        displayName: row.display_name,
        emoji: row.emoji,
        rating: Number(row.rating),
      },
    ]),
  );
}

async function submittedReportsFor(
  fixtureId: string,
): Promise<SubmittedReport[]> {
  const rows = await submittedReports(fixtureId);

  return rows.map((row) => ({
    playerId: row.player_id,
    goals: row.goals,
    assists: row.assists,
    nutmegs: row.nutmegs,
    tackles: row.tackles,
    saves: row.saves,
    ownGoals: row.own_goals,
    selfRating: row.self_rating,
    motmVoteFor: row.motm_player_id,
    goalsFor: row.reported_goals_for,
    goalsAgainst: row.reported_goals_against,
  }));
}

async function rsvpFacts(fixtureId: string): Promise<{
  firstToRespondPlayerId: string | null;
  promotedPlayerIds: Set<string>;
}> {
  const rows = await db()
    .select({
      player_id: rsvps.player_id,
      promoted_at: rsvps.promoted_at,
    })
    .from(rsvps)
    .where(and(eq(rsvps.fixture_id, fixtureId), eq(rsvps.status, "in")))
    .orderBy(asc(rsvps.in_since));

  return {
    firstToRespondPlayerId: rows[0]?.player_id ?? null,
    promotedPlayerIds: new Set(
      rows.filter((r) => r.promoted_at).map((r) => r.player_id),
    ),
  };
}

export interface AppliedSettlement {
  /** Players whose rating actually moved on this run. */
  rated: number;
  /** Players skipped because they had already been rated for this fixture. */
  alreadyRated: number;
  badgesAwarded: number;
  scoreWritten: boolean;
}

export async function applySettlement(
  fixtureId: string,
  settlement: Settlement,
): Promise<AppliedSettlement> {
  // Order below is load-bearing. Do not reorder without reading the note at the top.
  const scoreWritten = await writeScore(fixtureId, settlement);
  const alreadyRated = await ratedPlayerIds(fixtureId);

  let rated = 0;
  let badgesAwarded = 0;

  for (const player of settlement.players) {
    if (alreadyRated.has(player.playerId)) continue;

    // The unique index on (player_id, fixture_id) is the real guard: a concurrent
    // run that got there first turns this into zero rows rather than an error, and
    // their rating is then left alone.
    const inserted = await db()
      .insert(ratingEvents)
      .values({
        player_id: player.playerId,
        fixture_id: fixtureId,
        rating_before: String(player.rating.before),
        rating_after: String(player.rating.after),
        delta: String(player.rating.delta),
        reason: player.rating.reason,
      })
      .onConflictDoNothing({
        target: [ratingEvents.player_id, ratingEvents.fixture_id],
      })
      .returning({ id: ratingEvents.id });

    if (inserted.length === 0) continue;

    await db()
      .update(players)
      .set({ rating: String(player.rating.after) })
      .where(eq(players.id, player.playerId));

    rated += 1;
  }

  const badgeRows = settlement.players.flatMap((player) =>
    player.badges.map((code) => ({
      player_id: player.playerId,
      badge_code: code,
      fixture_id: fixtureId,
    })),
  );

  if (badgeRows.length > 0) {
    // A badge is earned once, ever. `returning` yields only the rows that were
    // actually inserted, which is exactly the count worth reporting.
    const awarded = await db()
      .insert(playerBadges)
      .values(badgeRows)
      .onConflictDoNothing({
        target: [playerBadges.player_id, playerBadges.badge_code],
      })
      .returning({ id: playerBadges.id });

    badgesAwarded = awarded.length;
  }

  // Last, deliberately. Until this lands the fixture is still `locked`, which is the
  // only thing that makes a half-finished settle recoverable.
  await db()
    .update(fixtures)
    .set({ status: "played" })
    .where(eq(fixtures.id, fixtureId));

  return {
    rated,
    alreadyRated: alreadyRated.size,
    badgesAwarded,
    scoreWritten,
  };
}

async function ratedPlayerIds(fixtureId: string): Promise<Set<string>> {
  const rows = await db()
    .select({ player_id: ratingEvents.player_id })
    .from(ratingEvents)
    .where(eq(ratingEvents.fixture_id, fixtureId));

  return new Set(rows.map((row) => row.player_id));
}

/**
 * Writes the agreed score onto both team rows. Skipped entirely when nobody reported
 * one: leaving `goals` null is how the rest of the system says "this game happened
 * but nobody could tell you what it finished", which is a truthful answer.
 */
async function writeScore(
  fixtureId: string,
  settlement: Settlement,
): Promise<boolean> {
  if (!settlement.score) return false;

  for (const side of ["a", "b"] as const) {
    await db()
      .update(fixtureTeams)
      .set({ goals: settlement.score[side] })
      .where(
        and(
          eq(fixtureTeams.fixture_id, fixtureId),
          eq(fixtureTeams.side, side),
        ),
      );
  }

  return true;
}

/**
 * Read a fixture, settle it, write the result back. The cron and the backfill both
 * go through here so there is exactly one definition of what settling means.
 */
export async function settleOne(
  fixtureId: string,
): Promise<{ settlement: Settlement; applied: AppliedSettlement } | null> {
  const context = await settlementContextFor(fixtureId);
  if (!context) return null;

  const settlement = settleFixture(context);
  const applied = await applySettlement(fixtureId, settlement);
  return { settlement, applied };
}

/**
 * The fixture that should now be settled: teams were picked, kickoff was long enough
 * ago that everyone has had a chance to answer, and it has not been settled already.
 *
 * Looks for `locked`, never `played`. That is the other half of the recovery design —
 * settling moves the fixture to `played` as its final act, so anything still locked
 * is either unfinished or untouched, and either way wants finishing.
 */
export async function fixtureAwaitingSettlement(
  now: Date,
  afterHours = 12,
): Promise<{ id: string; kickoff_at: string; season_id: string } | null> {
  const cutoff = new Date(now.getTime() - afterHours * 60 * 60 * 1000);

  const [row] = await db()
    .select({
      id: fixtures.id,
      kickoff_at: fixtures.kickoff_at,
      season_id: fixtures.season_id,
    })
    .from(fixtures)
    .where(
      and(
        eq(fixtures.status, "locked"),
        lte(fixtures.kickoff_at, cutoff.toISOString()),
      ),
    )
    .orderBy(desc(fixtures.kickoff_at))
    .limit(1);

  return row ?? null;
}

import {
  settleFixture,
  type Settlement,
  type SettlementContext,
  type SettlementPlayer,
  type SubmittedReport,
} from "@/domain/settle";
import type { Side } from "@/domain/types";
import { db } from "@/lib/supabase";
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
 * Postgres has no transaction across separate PostgREST calls, so the ordering is
 * doing the work a transaction otherwise would.
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

  const [profiles, reports, careerBefore, streakBefore, badgesHeld, rsvps, recordedScore] =
    await Promise.all([
      playerProfiles(playerIds),
      submittedReportsFor(fixtureId),
      careerTotals(),
      currentStreaks(),
      badgesHeldBy(playerIds),
      rsvpFacts(fixtureId),
      recordedScoreFor(fixtureId),
    ]);

  const players: SettlementPlayer[] = selected.map((row) => {
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
    players,
    reports,
    careerBefore,
    streakBefore,
    badgesHeld,
    firstToRespondPlayerId: rsvps.firstToRespondPlayerId,
    promotedPlayerIds: rsvps.promotedPlayerIds,
    recordedScore,
  };
}

/**
 * A score already sitting on the fixture. Normally null — the settlement is what puts
 * it there — but a replayed fixture may have had one written by hand or by a seed.
 */
async function recordedScoreFor(fixtureId: string): Promise<{ a: number; b: number } | null> {
  const { data, error } = await db()
    .from("fixture_teams")
    .select("side, goals")
    .eq("fixture_id", fixtureId);
  if (error) throw error;

  const a = data?.find((row) => row.side === "a")?.goals;
  const b = data?.find((row) => row.side === "b")?.goals;

  if (a === null || a === undefined || b === null || b === undefined) return null;
  return { a, b };
}

async function selectedForFixture(fixtureId: string): Promise<SelectedRow[]> {
  const { data, error } = await db()
    .from("team_players")
    .select("player_id, is_sub, fixture_teams(side)")
    .eq("fixture_id", fixtureId);
  if (error) throw error;

  const rows: SelectedRow[] = [];
  for (const row of data ?? []) {
    const side = row.fixture_teams?.side;
    if (side !== "a" && side !== "b") continue;
    rows.push({ playerId: row.player_id, side, isSub: row.is_sub });
  }
  return rows;
}

interface Profile {
  displayName: string;
  emoji: string;
  rating: number;
}

async function playerProfiles(playerIds: string[]): Promise<Map<string, Profile>> {
  if (playerIds.length === 0) return new Map();

  const { data, error } = await db()
    .from("players")
    .select("id, display_name, emoji, rating")
    .in("id", playerIds);
  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [
      row.id,
      { displayName: row.display_name, emoji: row.emoji, rating: Number(row.rating) },
    ]),
  );
}

async function submittedReportsFor(fixtureId: string): Promise<SubmittedReport[]> {
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
  const { data, error } = await db()
    .from("rsvps")
    .select("player_id, in_since, promoted_at")
    .eq("fixture_id", fixtureId)
    .eq("status", "in")
    .order("in_since", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  return {
    firstToRespondPlayerId: rows[0]?.player_id ?? null,
    promotedPlayerIds: new Set(rows.filter((r) => r.promoted_at).map((r) => r.player_id)),
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
  const scoreWritten = await writeScore(fixtureId, settlement);
  const alreadyRated = await ratedPlayerIds(fixtureId);

  let rated = 0;
  let badgesAwarded = 0;

  for (const player of settlement.players) {
    if (alreadyRated.has(player.playerId)) continue;

    const { error } = await db().from("rating_events").insert({
      player_id: player.playerId,
      fixture_id: fixtureId,
      rating_before: player.rating.before,
      rating_after: player.rating.after,
      delta: player.rating.delta,
      reason: player.rating.reason,
    });

    // A concurrent run got there first; leave their rating alone.
    if (error) {
      if (error.code === "23505") continue;
      throw error;
    }

    const { error: playerError } = await db()
      .from("players")
      .update({ rating: player.rating.after })
      .eq("id", player.playerId);
    if (playerError) throw playerError;

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
    const { data, error } = await db()
      .from("player_badges")
      .upsert(badgeRows, { onConflict: "player_id,badge_code", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    badgesAwarded = data?.length ?? 0;
  }

  const { error: statusError } = await db()
    .from("fixtures")
    .update({ status: "played" })
    .eq("id", fixtureId);
  if (statusError) throw statusError;

  return { rated, alreadyRated: alreadyRated.size, badgesAwarded, scoreWritten };
}

async function ratedPlayerIds(fixtureId: string): Promise<Set<string>> {
  const { data, error } = await db()
    .from("rating_events")
    .select("player_id")
    .eq("fixture_id", fixtureId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.player_id));
}

/**
 * Writes the agreed score onto both team rows. Skipped entirely when nobody reported
 * one: leaving `goals` null is how the rest of the system says "this game happened
 * but nobody could tell you what it finished", which is a truthful answer.
 */
async function writeScore(fixtureId: string, settlement: Settlement): Promise<boolean> {
  if (!settlement.score) return false;

  for (const side of ["a", "b"] as const) {
    const { error } = await db()
      .from("fixture_teams")
      .update({ goals: settlement.score[side] })
      .eq("fixture_id", fixtureId)
      .eq("side", side);
    if (error) throw error;
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
 */
export async function fixtureAwaitingSettlement(
  now: Date,
  afterHours = 12,
): Promise<{ id: string; kickoff_at: string; season_id: string } | null> {
  const cutoff = new Date(now.getTime() - afterHours * 60 * 60 * 1000);

  const { data, error } = await db()
    .from("fixtures")
    .select("id, kickoff_at, season_id")
    .eq("status", "locked")
    .lte("kickoff_at", cutoff.toISOString())
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

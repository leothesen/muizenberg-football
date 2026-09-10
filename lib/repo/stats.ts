import type { CareerTotals } from "@/domain/badges";
import type { SeasonStatRow } from "@/domain/leaderboards";
import type { CareerStatRow, FixtureStatRow, RecordHolder } from "@/domain/records";
import type { Outcome } from "@/domain/types";
import { db } from "@/lib/supabase";

/**
 * Reading the fantasy layer.
 *
 * Everything here comes out of the curated views, which are the single definition of
 * "how many goals has he got". The mapping is fussy because every column on a view
 * is nullable as far as the generated types are concerned — a view cannot promise
 * not-null — so each one is defaulted here rather than being asserted away.
 */

const int = (value: number | null | undefined): number => Number(value ?? 0);
const num = (value: number | string | null | undefined): number => Number(value ?? 0);

export async function seasonTable(seasonId: string): Promise<SeasonStatRow[]> {
  const { data, error } = await db()
    .from("v_season_table")
    .select("*")
    .eq("season_id", seasonId);
  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.player_id !== null)
    .map((row) => ({
      playerId: row.player_id as string,
      displayName: row.display_name ?? "Someone",
      emoji: row.emoji ?? "⚽",
      rating: num(row.rating),
      appearances: int(row.appearances),
      goals: int(row.goals),
      assists: int(row.assists),
      nutmegs: int(row.nutmegs),
      tackles: int(row.tackles),
      saves: int(row.saves),
      ownGoals: int(row.own_goals),
      motmVotes: int(row.motm_votes),
      wins: int(row.wins),
      draws: int(row.draws),
      losses: int(row.losses),
      avgSelfRating: row.avg_self_rating === null ? null : num(row.avg_self_rating),
    }));
}

export async function careerTable(): Promise<CareerStatRow[]> {
  const { data, error } = await db().from("v_career_table").select("*");
  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.player_id !== null)
    .map((row) => ({
      playerId: row.player_id as string,
      displayName: row.display_name ?? "Someone",
      emoji: row.emoji ?? "⚽",
      appearances: int(row.appearances),
      goals: int(row.goals),
      assists: int(row.assists),
      nutmegs: int(row.nutmegs),
      tackles: int(row.tackles),
      saves: int(row.saves),
      motmVotes: int(row.motm_votes),
      rating: num(row.rating),
    }));
}

/** Career totals in the shape the badge rules want, keyed by player. */
export async function careerTotals(): Promise<Map<string, CareerTotals>> {
  const { data, error } = await db()
    .from("v_career_table")
    .select("player_id, appearances, goals, assists, nutmegs, motm_awards");
  if (error) throw error;

  const totals = new Map<string, CareerTotals>();
  for (const row of data ?? []) {
    if (!row.player_id) continue;
    totals.set(row.player_id, {
      appearances: int(row.appearances),
      goals: int(row.goals),
      assists: int(row.assists),
      nutmegs: int(row.nutmegs),
      motmAwards: int(row.motm_awards),
    });
  }
  return totals;
}

function toOutcome(value: string | null): Outcome | null {
  return value === "win" || value === "draw" || value === "loss" ? value : null;
}

/** Every per-player, per-night line, for the records board. */
export async function fixtureStatRows(): Promise<FixtureStatRow[]> {
  const [stats, names] = await Promise.all([
    db().from("v_player_fixture_stats").select("*"),
    playerNames(),
  ]);
  if (stats.error) throw stats.error;

  return (stats.data ?? [])
    .filter((row) => row.player_id !== null && row.fixture_id !== null)
    .map((row) => {
      const named = names.get(row.player_id as string);
      return {
        playerId: row.player_id as string,
        displayName: named?.displayName ?? "Someone",
        emoji: named?.emoji ?? "⚽",
        fixtureId: row.fixture_id as string,
        kickoffAt: new Date(row.kickoff_at ?? 0),
        goals: int(row.goals),
        assists: int(row.assists),
        nutmegs: int(row.nutmegs),
        tackles: int(row.tackles),
        saves: int(row.saves),
        motmVotes: int(row.motm_votes),
        outcome: toOutcome(row.outcome),
        goalsFor: row.goals_for === null ? null : int(row.goals_for),
        goalsAgainst: row.goals_against === null ? null : int(row.goals_against),
      };
    });
}

export interface NamedPlayer {
  displayName: string;
  emoji: string;
}

export async function playerNames(): Promise<Map<string, NamedPlayer>> {
  const { data, error } = await db().from("players").select("id, display_name, emoji");
  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [
      row.id,
      { displayName: row.display_name, emoji: row.emoji } satisfies NamedPlayer,
    ]),
  );
}

/** Played fixtures, most recent first — the spine of every streak calculation. */
export async function playedFixtureIds(): Promise<string[]> {
  const { data, error } = await db()
    .from("fixtures")
    .select("id, kickoff_at")
    .eq("status", "played")
    .order("kickoff_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

/** Which fixtures each player was selected for. */
export async function appearancesByPlayer(): Promise<Map<string, Set<string>>> {
  const { data, error } = await db().from("team_players").select("player_id, fixture_id");
  if (error) throw error;

  const appearances = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (!row.fixture_id) continue;
    const set = appearances.get(row.player_id) ?? new Set<string>();
    set.add(row.fixture_id);
    appearances.set(row.player_id, set);
  }
  return appearances;
}

/** Streak going into the next game, per player, counting only settled fixtures. */
export async function currentStreaks(): Promise<Map<string, number>> {
  const [fixtureIds, appearances] = await Promise.all([
    playedFixtureIds(),
    appearancesByPlayer(),
  ]);

  const streaks = new Map<string, number>();
  for (const [playerId, played] of appearances) {
    let streak = 0;
    for (const fixtureId of fixtureIds) {
      if (!played.has(fixtureId)) break;
      streak += 1;
    }
    streaks.set(playerId, streak);
  }
  return streaks;
}

export async function badgesHeldBy(playerIds: string[]): Promise<Map<string, Set<string>>> {
  if (playerIds.length === 0) return new Map();

  const { data, error } = await db()
    .from("player_badges")
    .select("player_id, badge_code")
    .in("player_id", playerIds);
  if (error) throw error;

  const held = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const set = held.get(row.player_id) ?? new Set<string>();
    set.add(row.badge_code);
    held.set(row.player_id, set);
  }
  return held;
}

export interface BadgeAward {
  code: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  earnedAt: Date;
  fixtureId: string | null;
}

export async function badgeCatalogue() {
  const { data, error } = await db().from("badges").select("*").order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function badgesFor(playerId: string): Promise<BadgeAward[]> {
  const { data, error } = await db()
    .from("player_badges")
    .select("badge_code, earned_at, fixture_id, badges(name, description, emoji, tier, sort_order)")
    .eq("player_id", playerId)
    .order("earned_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    code: row.badge_code,
    name: row.badges?.name ?? row.badge_code,
    description: row.badges?.description ?? "",
    emoji: row.badges?.emoji ?? "🏅",
    tier: row.badges?.tier ?? "bronze",
    earnedAt: new Date(row.earned_at),
    fixtureId: row.fixture_id,
  }));
}

export interface FormEntry {
  fixtureId: string | null;
  outcome: Outcome | null;
  delta: number;
  reason: string;
  ratingAfter: number;
  at: Date;
}

/**
 * Recent form, newest first. Rating history and results are stored separately, so
 * they are stitched together on fixture id here rather than in a view — the rating
 * event is the spine, because a game with no agreed score still moved the number.
 */
export async function recentForm(playerId: string, limit = 5): Promise<FormEntry[]> {
  const { data, error } = await db()
    .from("rating_events")
    .select("fixture_id, delta, reason, rating_after, created_at")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const events = data ?? [];
  const fixtureIds = events.map((e) => e.fixture_id).filter((id): id is string => id !== null);

  const outcomes = new Map<string, Outcome | null>();
  if (fixtureIds.length > 0) {
    const { data: stats, error: statsError } = await db()
      .from("v_player_fixture_stats")
      .select("fixture_id, outcome")
      .eq("player_id", playerId)
      .in("fixture_id", fixtureIds);
    if (statsError) throw statsError;
    for (const row of stats ?? []) {
      if (row.fixture_id) outcomes.set(row.fixture_id, toOutcome(row.outcome));
    }
  }

  return events.map((event) => ({
    fixtureId: event.fixture_id,
    outcome: event.fixture_id ? (outcomes.get(event.fixture_id) ?? null) : null,
    delta: num(event.delta),
    reason: event.reason,
    ratingAfter: num(event.rating_after),
    at: new Date(event.created_at),
  }));
}

/** Everyone who has ever been picked, for the longest-streak record. */
export async function streakInputs(): Promise<{
  fixtureIdsOldestFirst: string[];
  byPlayer: Map<string, { holder: RecordHolder; fixtureIds: ReadonlySet<string> }>;
}> {
  const [newestFirst, appearances, names] = await Promise.all([
    playedFixtureIds(),
    appearancesByPlayer(),
    playerNames(),
  ]);

  const played = new Set(newestFirst);
  const byPlayer = new Map<string, { holder: RecordHolder; fixtureIds: ReadonlySet<string> }>();

  for (const [playerId, fixtureIds] of appearances) {
    const named = names.get(playerId);
    byPlayer.set(playerId, {
      holder: {
        playerId,
        displayName: named?.displayName ?? "Someone",
        emoji: named?.emoji ?? "⚽",
      },
      // Only settled fixtures count; a locked one has not happened yet.
      fixtureIds: new Set([...fixtureIds].filter((id) => played.has(id))),
    });
  }

  return { fixtureIdsOldestFirst: [...newestFirst].reverse(), byPlayer };
}

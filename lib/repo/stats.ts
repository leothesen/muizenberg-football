import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { CareerTotals } from "@/domain/badges";
import type { SeasonStatRow } from "@/domain/leaderboards";
import type {
  CareerStatRow,
  FixtureStatRow,
  RecordHolder,
} from "@/domain/records";
import type { Outcome } from "@/domain/types";
import { db } from "@/lib/db";
import {
  badges,
  fixtures,
  playerBadges,
  players,
  ratingEvents,
  teamPlayers,
  vCareerTable,
  vPlayerFixtureStats,
  vSeasonTable,
} from "@/lib/db/schema";

/**
 * Reading the fantasy layer.
 *
 * Everything here comes out of the curated views, which are the single definition of
 * "how many goals has he got". The mapping is fussy because every column on a view
 * is nullable as far as the types are concerned — a view cannot promise not-null —
 * so each one is defaulted here rather than being asserted away.
 *
 * `num` matters more than it looks: rating and delta are `numeric`, which the driver
 * returns as a string. PostgREST used to coerce them. Averaging or sorting a column
 * of strings fails quietly rather than loudly.
 */

const int = (value: number | null | undefined): number => Number(value ?? 0);
const num = (value: number | string | null | undefined): number =>
  Number(value ?? 0);

export async function seasonTable(seasonId: string): Promise<SeasonStatRow[]> {
  const rows = await db()
    .select()
    .from(vSeasonTable)
    .where(eq(vSeasonTable.season_id, seasonId));

  return rows
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
      avgSelfRating:
        row.avg_self_rating === null ? null : num(row.avg_self_rating),
    }));
}

export async function careerTable(): Promise<CareerStatRow[]> {
  const rows = await db().select().from(vCareerTable);

  return rows
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
  const rows = await db()
    .select({
      player_id: vCareerTable.player_id,
      appearances: vCareerTable.appearances,
      goals: vCareerTable.goals,
      assists: vCareerTable.assists,
      nutmegs: vCareerTable.nutmegs,
      motm_awards: vCareerTable.motm_awards,
    })
    .from(vCareerTable);

  const totals = new Map<string, CareerTotals>();
  for (const row of rows) {
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
    db().select().from(vPlayerFixtureStats),
    playerNames(),
  ]);

  return stats
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
        goalsAgainst:
          row.goals_against === null ? null : int(row.goals_against),
      };
    });
}

export interface NamedPlayer {
  displayName: string;
  emoji: string;
}

export async function playerNames(): Promise<Map<string, NamedPlayer>> {
  const rows = await db()
    .select({
      id: players.id,
      display_name: players.display_name,
      emoji: players.emoji,
    })
    .from(players);

  return new Map(
    rows.map((row) => [
      row.id,
      { displayName: row.display_name, emoji: row.emoji } satisfies NamedPlayer,
    ]),
  );
}

/** Played fixtures, most recent first — the spine of every streak calculation. */
export async function playedFixtureIds(): Promise<string[]> {
  const rows = await db()
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(eq(fixtures.status, "played"))
    .orderBy(desc(fixtures.kickoff_at));

  return rows.map((row) => row.id);
}

/** Which fixtures each player was selected for. */
export async function appearancesByPlayer(): Promise<Map<string, Set<string>>> {
  const rows = await db()
    .select({
      player_id: teamPlayers.player_id,
      fixture_id: teamPlayers.fixture_id,
    })
    .from(teamPlayers);

  const appearances = new Map<string, Set<string>>();
  for (const row of rows) {
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

export async function badgesHeldBy(
  playerIds: string[],
): Promise<Map<string, Set<string>>> {
  if (playerIds.length === 0) return new Map();

  const rows = await db()
    .select({
      player_id: playerBadges.player_id,
      badge_code: playerBadges.badge_code,
    })
    .from(playerBadges)
    .where(inArray(playerBadges.player_id, playerIds));

  const held = new Map<string, Set<string>>();
  for (const row of rows) {
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
  return db().select().from(badges).orderBy(asc(badges.sort_order));
}

export async function badgesFor(playerId: string): Promise<BadgeAward[]> {
  const rows = await db()
    .select({
      badge_code: playerBadges.badge_code,
      earned_at: playerBadges.earned_at,
      fixture_id: playerBadges.fixture_id,
      name: badges.name,
      description: badges.description,
      emoji: badges.emoji,
      tier: badges.tier,
    })
    .from(playerBadges)
    .leftJoin(badges, eq(badges.code, playerBadges.badge_code))
    .where(eq(playerBadges.player_id, playerId))
    .orderBy(desc(playerBadges.earned_at));

  return rows.map((row) => ({
    code: row.badge_code,
    name: row.name ?? row.badge_code,
    description: row.description ?? "",
    emoji: row.emoji ?? "🏅",
    tier: row.tier ?? "bronze",
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
export async function recentForm(
  playerId: string,
  limit = 5,
): Promise<FormEntry[]> {
  const events = await db()
    .select({
      fixture_id: ratingEvents.fixture_id,
      delta: ratingEvents.delta,
      reason: ratingEvents.reason,
      rating_after: ratingEvents.rating_after,
      created_at: ratingEvents.created_at,
    })
    .from(ratingEvents)
    .where(eq(ratingEvents.player_id, playerId))
    .orderBy(desc(ratingEvents.created_at))
    .limit(limit);

  const fixtureIds = events
    .map((e) => e.fixture_id)
    .filter((id): id is string => id !== null);

  const outcomes = new Map<string, Outcome | null>();
  if (fixtureIds.length > 0) {
    const stats = await db()
      .select({
        fixture_id: vPlayerFixtureStats.fixture_id,
        outcome: vPlayerFixtureStats.outcome,
      })
      .from(vPlayerFixtureStats)
      .where(
        and(
          eq(vPlayerFixtureStats.player_id, playerId),
          inArray(vPlayerFixtureStats.fixture_id, fixtureIds),
        ),
      );

    for (const row of stats) {
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
  byPlayer: Map<
    string,
    { holder: RecordHolder; fixtureIds: ReadonlySet<string> }
  >;
}> {
  const [newestFirst, appearances, names] = await Promise.all([
    playedFixtureIds(),
    appearancesByPlayer(),
    playerNames(),
  ]);

  const played = new Set(newestFirst);
  const byPlayer = new Map<
    string,
    { holder: RecordHolder; fixtureIds: ReadonlySet<string> }
  >();

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

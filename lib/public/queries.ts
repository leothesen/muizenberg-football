import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { SeasonStatRow } from "@/domain/leaderboards";
import type {
  CareerStatRow,
  FixtureStatRow,
  RecordHolder,
} from "@/domain/records";
import type { Outcome, Side } from "@/domain/types";
import { DEFAULT_VENUE } from "@/domain/venues";
import { readPublic, type Db } from "@/lib/db";
import {
  vBadgesPublic,
  vCareerTable,
  vFixtureMotm,
  vFixtureTeamsPublic,
  vFixturesPublic,
  vPlayerBadgesPublic,
  vPlayerFixtureStats,
  vPlayersPublic,
  vRatingEventsPublic,
  vSeasonTable,
  vSeasonsPublic,
  vTeamPlayersPublic,
} from "@/lib/db/schema";

/**
 * Everything the website reads.
 *
 * Every one of these runs inside `readPublic`, which drops into the `web_reader`
 * role for the duration. That role holds SELECT on the curated views and nothing
 * else, so a mistake here cannot leak a Telegram identifier — the columns are not
 * merely omitted from the query, they are unreadable to the connection making it.
 *
 * One transaction per exported call, never one per query. Composed reads take the
 * transaction as an argument rather than opening their own, which keeps a page on a
 * single consistent snapshot and avoids nesting.
 *
 * Every column on a view is nullable as far as the types go — a view cannot promise
 * not-null — so each is defaulted at this boundary rather than asserted away deeper
 * in.
 */

/** The handle inside a `readPublic` transaction. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const int = (value: number | null | undefined): number => Number(value ?? 0);
const num = (value: number | string | null | undefined): number =>
  Number(value ?? 0);

function toOutcome(value: string | null): Outcome | null {
  return value === "win" || value === "draw" || value === "loss" ? value : null;
}

function toSide(value: string | null): Side {
  return value === "b" ? "b" : "a";
}

export interface PublicSeason {
  id: string;
  name: string;
  startedOn: string;
  endedOn: string | null;
}

export async function currentSeason(): Promise<PublicSeason | null> {
  return readPublic(async (tx) => {
    const [row] = await tx
      .select()
      .from(vSeasonsPublic)
      .where(isNull(vSeasonsPublic.ended_on))
      .orderBy(desc(vSeasonsPublic.started_on))
      .limit(1);

    if (!row?.id) return null;

    return {
      id: row.id,
      name: row.name ?? "This season",
      startedOn: row.started_on ?? "",
      endedOn: row.ended_on,
    };
  });
}

export async function seasonTable(seasonId: string): Promise<SeasonStatRow[]> {
  return readPublic(async (tx) => {
    const rows = await tx
      .select()
      .from(vSeasonTable)
      .where(eq(vSeasonTable.season_id, seasonId))
      // Added at N9. This view had no ordering anywhere, so tied rows swapped places
      // between page loads. display_name is unique enough to be a total order here.
      .orderBy(asc(vSeasonTable.display_name), asc(vSeasonTable.player_id));

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
  });
}

export interface PublicPlayer {
  id: string;
  displayName: string;
  emoji: string;
  rating: number;
  isActive: boolean;
}

async function allPlayersWithin(tx: Tx): Promise<PublicPlayer[]> {
  const rows = await tx
    .select({
      id: vPlayersPublic.id,
      display_name: vPlayersPublic.display_name,
      emoji: vPlayersPublic.emoji,
      rating: vPlayersPublic.rating,
      is_active: vPlayersPublic.is_active,
    })
    .from(vPlayersPublic)
    .orderBy(asc(vPlayersPublic.display_name));

  return rows
    .filter((row) => row.id !== null)
    .map((row) => ({
      id: row.id as string,
      displayName: row.display_name ?? "Someone",
      emoji: row.emoji ?? "⚽",
      rating: num(row.rating),
      isActive: row.is_active ?? true,
    }));
}

export async function allPlayers(): Promise<PublicPlayer[]> {
  return readPublic(allPlayersWithin);
}

export async function playerById(id: string): Promise<PublicPlayer | null> {
  return readPublic(async (tx) => {
    const [row] = await tx
      .select({
        id: vPlayersPublic.id,
        display_name: vPlayersPublic.display_name,
        emoji: vPlayersPublic.emoji,
        rating: vPlayersPublic.rating,
        is_active: vPlayersPublic.is_active,
      })
      .from(vPlayersPublic)
      .where(eq(vPlayersPublic.id, id))
      .limit(1);

    if (!row?.id) return null;

    return {
      id: row.id,
      displayName: row.display_name ?? "Someone",
      emoji: row.emoji ?? "⚽",
      rating: num(row.rating),
      isActive: row.is_active ?? true,
    };
  });
}

export async function careerTable(): Promise<CareerStatRow[]> {
  return readPublic(async (tx) => {
    const rows = await tx
      .select()
      .from(vCareerTable)
      .orderBy(asc(vCareerTable.display_name), asc(vCareerTable.player_id));

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
  });
}

export async function fixtureStatRows(): Promise<FixtureStatRow[]> {
  return readPublic(async (tx) => {
    const [stats, players] = await Promise.all([
      tx
        .select()
        .from(vPlayerFixtureStats)
        // The view carries no name, so player_id is the tie-break. It is a total
        // order, which is what was missing; the display order is imposed above it.
        .orderBy(
          asc(vPlayerFixtureStats.kickoff_at),
          asc(vPlayerFixtureStats.player_id),
        ),
      allPlayersWithin(tx),
    ]);

    const named = new Map(players.map((p) => [p.id, p] as const));

    return stats
      .filter((row) => row.player_id !== null && row.fixture_id !== null)
      .map((row) => {
        const player = named.get(row.player_id as string);
        return {
          playerId: row.player_id as string,
          displayName: player?.displayName ?? "Someone",
          emoji: player?.emoji ?? "⚽",
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
  });
}

export interface PublicFixture {
  id: string;
  kickoffAt: Date;
  venue: string;
  status: string;
  capacity: number;
  cancelledReason: string | null;
}

function toFixture(row: {
  id: string | null;
  kickoff_at: string | null;
  venue: string | null;
  status: string | null;
  capacity: number | null;
  cancelled_reason: string | null;
}): PublicFixture {
  return {
    id: row.id as string,
    kickoffAt: new Date(row.kickoff_at ?? 0),
    venue: row.venue ?? DEFAULT_VENUE.name,
    status: row.status ?? "scheduled",
    capacity: int(row.capacity),
    cancelledReason: row.cancelled_reason,
  };
}

const FIXTURE_COLUMNS = {
  id: vFixturesPublic.id,
  kickoff_at: vFixturesPublic.kickoff_at,
  venue: vFixturesPublic.venue,
  status: vFixturesPublic.status,
  capacity: vFixturesPublic.capacity,
  cancelled_reason: vFixturesPublic.cancelled_reason,
};

async function allFixturesWithin(tx: Tx): Promise<PublicFixture[]> {
  const rows = await tx
    .select(FIXTURE_COLUMNS)
    .from(vFixturesPublic)
    .orderBy(desc(vFixturesPublic.kickoff_at));

  return rows.filter((row) => row.id !== null).map(toFixture);
}

export async function allFixtures(): Promise<PublicFixture[]> {
  return readPublic(allFixturesWithin);
}

export async function fixtureById(id: string): Promise<PublicFixture | null> {
  return readPublic(async (tx) => {
    const [row] = await tx
      .select(FIXTURE_COLUMNS)
      .from(vFixturesPublic)
      .where(eq(vFixturesPublic.id, id))
      .limit(1);

    return row?.id ? toFixture(row) : null;
  });
}

/** The next game that has not happened yet, if there is one on the books. */
export async function nextFixture(now: Date): Promise<PublicFixture | null> {
  return readPublic(async (tx) => {
    const [row] = await tx
      .select(FIXTURE_COLUMNS)
      .from(vFixturesPublic)
      .where(
        and(
          inArray(vFixturesPublic.status, ["scheduled", "open", "locked"]),
          // Six hours of grace: a game that kicked off this evening is still "next"
          // to somebody looking at the site while it is being played.
          gte(
            vFixturesPublic.kickoff_at,
            new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
          ),
        ),
      )
      .orderBy(asc(vFixturesPublic.kickoff_at))
      .limit(1);

    return row?.id ? toFixture(row) : null;
  });
}

export interface PublicTeam {
  id: string;
  side: Side;
  name: string;
  colour: string;
  goals: number | null;
  players: {
    playerId: string;
    displayName: string;
    emoji: string;
    isSub: boolean;
  }[];
}

export async function teamsForFixture(
  fixtureId: string,
): Promise<PublicTeam[]> {
  return readPublic(async (tx) => {
    const [teams, members, players] = await Promise.all([
      tx
        .select()
        .from(vFixtureTeamsPublic)
        .where(eq(vFixtureTeamsPublic.fixture_id, fixtureId))
        .orderBy(asc(vFixtureTeamsPublic.side)),
      tx
        .select()
        .from(vTeamPlayersPublic)
        .where(eq(vTeamPlayersPublic.fixture_id, fixtureId))
        .orderBy(
          asc(vTeamPlayersPublic.is_sub),
          asc(vTeamPlayersPublic.player_id),
        ),
      allPlayersWithin(tx),
    ]);

    const named = new Map(players.map((p) => [p.id, p] as const));

    return teams
      .filter((team) => team.id !== null)
      .map((team) => ({
        id: team.id as string,
        side: toSide(team.side),
        name: team.name ?? "Team",
        colour: team.colour ?? "hut-green",
        goals: team.goals === null ? null : int(team.goals),
        players: members
          .filter((m) => m.fixture_team_id === team.id)
          .map((m) => {
            const player = named.get(m.player_id as string);
            return {
              playerId: m.player_id as string,
              displayName: player?.displayName ?? "Someone",
              emoji: player?.emoji ?? "⚽",
              isSub: m.is_sub ?? false,
            };
          })
          // Starters before subs, then alphabetical. The SQL order above is a total
          // order; this is the one a reader wants to see.
          .sort(
            (a, b) =>
              Number(a.isSub) - Number(b.isSub) ||
              a.displayName.localeCompare(b.displayName),
          ),
      }))
      .sort((a, b) => a.side.localeCompare(b.side));
  });
}

export interface PublicBadge {
  code: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  earnedAt: Date;
}

export async function badgesForPlayer(
  playerId: string,
): Promise<PublicBadge[]> {
  return readPublic(async (tx) => {
    const [held, catalogue] = await Promise.all([
      tx
        .select()
        .from(vPlayerBadgesPublic)
        .where(eq(vPlayerBadgesPublic.player_id, playerId))
        .orderBy(
          desc(vPlayerBadgesPublic.earned_at),
          asc(vPlayerBadgesPublic.badge_code),
        ),
      tx.select().from(vBadgesPublic),
    ]);

    const byCode = new Map(
      catalogue.map((b) => [b.code as string, b] as const),
    );

    return held
      .filter((row) => row.badge_code !== null)
      .map((row) => {
        const badge = byCode.get(row.badge_code as string);
        return {
          code: row.badge_code as string,
          name: badge?.name ?? (row.badge_code as string),
          description: badge?.description ?? "",
          emoji: badge?.emoji ?? "🏅",
          tier: badge?.tier ?? "bronze",
          earnedAt: new Date(row.earned_at ?? 0),
        };
      });
  });
}

export interface PublicRatingEvent {
  fixtureId: string | null;
  delta: number;
  ratingAfter: number;
  reason: string;
  at: Date;
}

export async function ratingHistory(
  playerId: string,
  limit = 20,
): Promise<PublicRatingEvent[]> {
  return readPublic(async (tx) => {
    const rows = await tx
      .select()
      .from(vRatingEventsPublic)
      .where(eq(vRatingEventsPublic.player_id, playerId))
      .orderBy(desc(vRatingEventsPublic.created_at))
      .limit(limit);

    return rows.map((row) => ({
      fixtureId: row.fixture_id,
      delta: num(row.delta),
      ratingAfter: num(row.rating_after),
      reason: row.reason ?? "",
      at: new Date(row.created_at ?? 0),
    }));
  });
}

/** Everyone who has ever been picked, for the longest-streak record. */
export async function streakInputs(): Promise<{
  fixtureIdsOldestFirst: string[];
  byPlayer: Map<
    string,
    { holder: RecordHolder; fixtureIds: ReadonlySet<string> }
  >;
}> {
  return readPublic(async (tx) => {
    const [fixtures, members, players] = await Promise.all([
      allFixturesWithin(tx),
      tx
        .select({
          player_id: vTeamPlayersPublic.player_id,
          fixture_id: vTeamPlayersPublic.fixture_id,
        })
        .from(vTeamPlayersPublic),
      allPlayersWithin(tx),
    ]);

    const played = fixtures.filter((f) => f.status === "played");
    const playedIds = new Set(played.map((f) => f.id));
    const named = new Map(players.map((p) => [p.id, p] as const));

    const byPlayer = new Map<
      string,
      { holder: RecordHolder; fixtureIds: ReadonlySet<string> }
    >();

    for (const row of members) {
      const playerId = row.player_id as string | null;
      const fixtureId = row.fixture_id as string | null;
      if (!playerId || !fixtureId || !playedIds.has(fixtureId)) continue;

      const existing = byPlayer.get(playerId);
      if (existing) {
        (existing.fixtureIds as Set<string>).add(fixtureId);
        continue;
      }

      const player = named.get(playerId);
      byPlayer.set(playerId, {
        holder: {
          playerId,
          displayName: player?.displayName ?? "Someone",
          emoji: player?.emoji ?? "⚽",
        },
        fixtureIds: new Set([fixtureId]),
      });
    }

    return {
      // Oldest first, which is the direction the streak scan runs.
      fixtureIdsOldestFirst: played.map((f) => f.id).reverse(),
      byPlayer,
    };
  });
}

export async function motmForFixture(
  fixtureId: string,
): Promise<
  { playerId: string; displayName: string; emoji: string; votes: number }[]
> {
  return readPublic(async (tx) => {
    const [votes, players] = await Promise.all([
      tx
        .select()
        .from(vFixtureMotm)
        .where(eq(vFixtureMotm.fixture_id, fixtureId))
        .orderBy(desc(vFixtureMotm.votes), asc(vFixtureMotm.player_id)),
      allPlayersWithin(tx),
    ]);

    const named = new Map(players.map((p) => [p.id, p] as const));

    return votes
      .filter((row) => row.player_id !== null)
      .map((row) => {
        const player = named.get(row.player_id as string);
        return {
          playerId: row.player_id as string,
          displayName: player?.displayName ?? "Someone",
          emoji: player?.emoji ?? "⚽",
          votes: int(row.votes),
        };
      });
  });
}

import "server-only";
import type { SeasonStatRow } from "@/domain/leaderboards";
import type { CareerStatRow, FixtureStatRow, RecordHolder } from "@/domain/records";
import type { Outcome, Side } from "@/domain/types";
import { publicDb } from "@/lib/supabase";

/**
 * Everything the website reads.
 *
 * All of it through the anon key, so a mistake here cannot leak a Telegram
 * identifier: those columns are not in the views this role can see. Every column on a
 * view is nullable as far as the generated types go — a view cannot promise not-null
 * — so each is defaulted at this boundary rather than asserted away deeper in.
 */

const int = (value: number | null | undefined): number => Number(value ?? 0);
const num = (value: number | string | null | undefined): number => Number(value ?? 0);

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
  const { data, error } = await publicDb()
    .from("v_seasons_public")
    .select("*")
    .is("ended_on", null)
    .order("started_on", { ascending: false })
    .limit(1);
  if (error) throw error;

  const row = data?.[0];
  if (!row?.id) return null;

  return {
    id: row.id,
    name: row.name ?? "This season",
    startedOn: row.started_on ?? "",
    endedOn: row.ended_on,
  };
}

export async function seasonTable(seasonId: string): Promise<SeasonStatRow[]> {
  const { data, error } = await publicDb()
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

export interface PublicPlayer {
  id: string;
  displayName: string;
  emoji: string;
  rating: number;
  isActive: boolean;
}

export async function allPlayers(): Promise<PublicPlayer[]> {
  const { data, error } = await publicDb()
    .from("v_players_public")
    .select("id, display_name, emoji, rating, is_active")
    .order("display_name");
  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.id !== null)
    .map((row) => ({
      id: row.id as string,
      displayName: row.display_name ?? "Someone",
      emoji: row.emoji ?? "⚽",
      rating: num(row.rating),
      isActive: row.is_active ?? true,
    }));
}

export async function playerById(id: string): Promise<PublicPlayer | null> {
  const { data, error } = await publicDb()
    .from("v_players_public")
    .select("id, display_name, emoji, rating, is_active")
    .eq("id", id)
    .limit(1);
  if (error) throw error;

  const row = data?.[0];
  if (!row?.id) return null;

  return {
    id: row.id,
    displayName: row.display_name ?? "Someone",
    emoji: row.emoji ?? "⚽",
    rating: num(row.rating),
    isActive: row.is_active ?? true,
  };
}

export async function careerTable(): Promise<CareerStatRow[]> {
  const { data, error } = await publicDb().from("v_career_table").select("*");
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

export async function fixtureStatRows(): Promise<FixtureStatRow[]> {
  const [stats, players] = await Promise.all([
    publicDb().from("v_player_fixture_stats").select("*"),
    allPlayers(),
  ]);
  if (stats.error) throw stats.error;

  const named = new Map(players.map((p) => [p.id, p] as const));

  return (stats.data ?? [])
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
        goalsAgainst: row.goals_against === null ? null : int(row.goals_against),
      };
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
    venue: row.venue ?? "Muizenberg",
    status: row.status ?? "scheduled",
    capacity: int(row.capacity),
    cancelledReason: row.cancelled_reason,
  };
}

export async function allFixtures(): Promise<PublicFixture[]> {
  const { data, error } = await publicDb()
    .from("v_fixtures_public")
    .select("id, kickoff_at, venue, status, capacity, cancelled_reason")
    .order("kickoff_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).filter((row) => row.id !== null).map(toFixture);
}

export async function fixtureById(id: string): Promise<PublicFixture | null> {
  const { data, error } = await publicDb()
    .from("v_fixtures_public")
    .select("id, kickoff_at, venue, status, capacity, cancelled_reason")
    .eq("id", id)
    .limit(1);
  if (error) throw error;

  const row = data?.[0];
  return row?.id ? toFixture(row) : null;
}

/** The next game that has not happened yet, if there is one on the books. */
export async function nextFixture(now: Date): Promise<PublicFixture | null> {
  const { data, error } = await publicDb()
    .from("v_fixtures_public")
    .select("id, kickoff_at, venue, status, capacity, cancelled_reason")
    .in("status", ["scheduled", "open", "locked"])
    .gte("kickoff_at", new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(1);
  if (error) throw error;

  const row = data?.[0];
  return row?.id ? toFixture(row) : null;
}

export interface PublicTeam {
  id: string;
  side: Side;
  name: string;
  colour: string;
  goals: number | null;
  players: { playerId: string; displayName: string; emoji: string; isSub: boolean }[];
}

export async function teamsForFixture(fixtureId: string): Promise<PublicTeam[]> {
  const [teams, members, players] = await Promise.all([
    publicDb().from("v_fixture_teams_public").select("*").eq("fixture_id", fixtureId),
    publicDb().from("v_team_players_public").select("*").eq("fixture_id", fixtureId),
    allPlayers(),
  ]);
  if (teams.error) throw teams.error;
  if (members.error) throw members.error;

  const named = new Map(players.map((p) => [p.id, p] as const));

  return (teams.data ?? [])
    .filter((team) => team.id !== null)
    .map((team) => ({
      id: team.id as string,
      side: toSide(team.side),
      name: team.name ?? "Team",
      colour: team.colour ?? "hut-green",
      goals: team.goals === null ? null : int(team.goals),
      players: (members.data ?? [])
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
        .sort((a, b) => Number(a.isSub) - Number(b.isSub) || a.displayName.localeCompare(b.displayName)),
    }))
    .sort((a, b) => a.side.localeCompare(b.side));
}

export interface PublicBadge {
  code: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  earnedAt: Date;
}

export async function badgesForPlayer(playerId: string): Promise<PublicBadge[]> {
  const [held, catalogue] = await Promise.all([
    publicDb()
      .from("v_player_badges_public")
      .select("*")
      .eq("player_id", playerId)
      .order("earned_at", { ascending: false }),
    publicDb().from("v_badges_public").select("*"),
  ]);
  if (held.error) throw held.error;
  if (catalogue.error) throw catalogue.error;

  const byCode = new Map((catalogue.data ?? []).map((b) => [b.code as string, b] as const));

  return (held.data ?? [])
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
}

export interface PublicRatingEvent {
  fixtureId: string | null;
  delta: number;
  ratingAfter: number;
  reason: string;
  at: Date;
}

export async function ratingHistory(playerId: string, limit = 20): Promise<PublicRatingEvent[]> {
  const { data, error } = await publicDb()
    .from("v_rating_events_public")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    fixtureId: row.fixture_id,
    delta: num(row.delta),
    ratingAfter: num(row.rating_after),
    reason: row.reason ?? "",
    at: new Date(row.created_at ?? 0),
  }));
}

/** Everyone who has ever been picked, for the longest-streak record. */
export async function streakInputs(): Promise<{
  fixtureIdsOldestFirst: string[];
  byPlayer: Map<string, { holder: RecordHolder; fixtureIds: ReadonlySet<string> }>;
}> {
  const [fixtures, members, players] = await Promise.all([
    allFixtures(),
    publicDb().from("v_team_players_public").select("player_id, fixture_id"),
    allPlayers(),
  ]);
  if (members.error) throw members.error;

  const played = fixtures.filter((f) => f.status === "played");
  const playedIds = new Set(played.map((f) => f.id));
  const named = new Map(players.map((p) => [p.id, p] as const));

  const byPlayer = new Map<string, { holder: RecordHolder; fixtureIds: ReadonlySet<string> }>();

  for (const row of members.data ?? []) {
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
}

export async function motmForFixture(fixtureId: string): Promise<
  { playerId: string; displayName: string; emoji: string; votes: number }[]
> {
  const [votes, players] = await Promise.all([
    publicDb().from("v_fixture_motm").select("*").eq("fixture_id", fixtureId),
    allPlayers(),
  ]);
  if (votes.error) throw votes.error;

  const named = new Map(players.map((p) => [p.id, p] as const));

  return (votes.data ?? [])
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
}

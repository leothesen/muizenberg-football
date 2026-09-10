import type { PickedTeams } from "@/domain/teams";
import { db } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type FixtureTeamRow = Database["public"]["Tables"]["fixture_teams"]["Row"];

export interface StoredTeam {
  team: FixtureTeamRow;
  players: { playerId: string; displayName: string; emoji: string; isSub: boolean }[];
}

/**
 * Writes a team sheet, replacing any previous one for the fixture.
 *
 * Re-picking is a legitimate operation — somebody drops out an hour before kickoff
 * and the sides need rebalancing — so this is a replace rather than an insert, and
 * the cascade on fixture_teams removes the old team_players rows with it.
 */
export async function saveTeams(fixtureId: string, picked: PickedTeams): Promise<void> {
  const { error: clearError } = await db()
    .from("fixture_teams")
    .delete()
    .eq("fixture_id", fixtureId);
  if (clearError) throw clearError;

  for (const sheet of [picked.a, picked.b]) {
    const { data: team, error } = await db()
      .from("fixture_teams")
      .insert({
        fixture_id: fixtureId,
        side: sheet.side,
        name: sheet.name,
        colour: sheet.colour,
      })
      .select("*")
      .single();
    if (error) throw error;

    const members = [
      ...sheet.starters.map((p) => ({ player_id: p.id, is_sub: false })),
      ...sheet.subs.map((p) => ({ player_id: p.id, is_sub: true })),
    ].map((m) => ({ ...m, fixture_team_id: team.id }));

    if (members.length > 0) {
      const { error: memberError } = await db().from("team_players").insert(members);
      if (memberError) throw memberError;
    }
  }
}

export async function teamsFor(fixtureId: string): Promise<StoredTeam[]> {
  const { data: teams, error } = await db()
    .from("fixture_teams")
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("side");
  if (error) throw error;
  if (!teams || teams.length === 0) return [];

  const { data: members, error: memberError } = await db()
    .from("team_players")
    .select("fixture_team_id, is_sub, player_id, players(display_name, emoji)")
    .eq("fixture_id", fixtureId);
  if (memberError) throw memberError;

  return teams.map((team) => ({
    team,
    players: (members ?? [])
      .filter((m) => m.fixture_team_id === team.id)
      .map((m) => ({
        playerId: m.player_id,
        displayName: m.players?.display_name ?? "Someone",
        emoji: m.players?.emoji ?? "⚽",
        isSub: m.is_sub,
      })),
  }));
}

export async function attachTeamsMessage(fixtureId: string, messageId: number): Promise<void> {
  const { error } = await db()
    .from("fixtures")
    .update({ teams_message_id: messageId, status: "locked" })
    .eq("id", fixtureId);
  if (error) throw error;
}

/** Everyone selected for a fixture, used to decide who gets asked how it went. */
export async function selectedPlayers(fixtureId: string) {
  const { data, error } = await db()
    .from("team_players")
    .select("player_id, is_sub, players(id, display_name, emoji, telegram_user_id, private_chat_id)")
    .eq("fixture_id", fixtureId);
  if (error) throw error;
  return data ?? [];
}

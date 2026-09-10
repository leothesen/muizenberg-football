import { asc, eq } from "drizzle-orm";
import type { PickedTeams } from "@/domain/teams";
import { db } from "@/lib/db";
import { fixtureTeams, fixtures, players, teamPlayers } from "@/lib/db/schema";

export type FixtureTeamRow = typeof fixtureTeams.$inferSelect;

export interface StoredTeam {
  team: FixtureTeamRow;
  players: {
    playerId: string;
    displayName: string;
    emoji: string;
    isSub: boolean;
  }[];
}

/**
 * Writes a team sheet, replacing any previous one for the fixture.
 *
 * Re-picking is a legitimate operation — somebody drops out an hour before kickoff
 * and the sides need rebalancing — so this is a replace rather than an insert, and
 * the cascade on fixture_teams removes the old team_players rows with it.
 */
export async function saveTeams(
  fixtureId: string,
  picked: PickedTeams,
): Promise<void> {
  await db().delete(fixtureTeams).where(eq(fixtureTeams.fixture_id, fixtureId));

  for (const sheet of [picked.a, picked.b]) {
    const [team] = await db()
      .insert(fixtureTeams)
      .values({
        fixture_id: fixtureId,
        side: sheet.side,
        name: sheet.name,
        colour: sheet.colour,
      })
      .returning();

    const members = [
      ...sheet.starters.map((p) => ({ player_id: p.id, is_sub: false })),
      ...sheet.subs.map((p) => ({ player_id: p.id, is_sub: true })),
    ].map((m) => ({ ...m, fixture_team_id: team!.id }));

    // `fixture_id` is deliberately not set here. A trigger derives it from the team,
    // which is what lets a unique index stop somebody appearing on both sides — the
    // constraint on (fixture_team_id, player_id) cannot see across teams.
    if (members.length > 0) {
      await db().insert(teamPlayers).values(members);
    }
  }
}

export async function teamsFor(fixtureId: string): Promise<StoredTeam[]> {
  const teams = await db()
    .select()
    .from(fixtureTeams)
    .where(eq(fixtureTeams.fixture_id, fixtureId))
    .orderBy(asc(fixtureTeams.side));

  if (teams.length === 0) return [];

  const members = await db()
    .select({
      fixture_team_id: teamPlayers.fixture_team_id,
      is_sub: teamPlayers.is_sub,
      player_id: teamPlayers.player_id,
      display_name: players.display_name,
      emoji: players.emoji,
    })
    .from(teamPlayers)
    .innerJoin(players, eq(players.id, teamPlayers.player_id))
    .where(eq(teamPlayers.fixture_id, fixtureId));

  return teams.map((team) => ({
    team,
    players: members
      .filter((m) => m.fixture_team_id === team.id)
      .map((m) => ({
        playerId: m.player_id,
        displayName: m.display_name ?? "Someone",
        emoji: m.emoji ?? "⚽",
        isSub: m.is_sub,
      })),
  }));
}

export async function attachTeamsMessage(
  fixtureId: string,
  messageId: number,
): Promise<void> {
  await db()
    .update(fixtures)
    .set({ teams_message_id: messageId, status: "locked" })
    .where(eq(fixtures.id, fixtureId));
}

/** Everyone selected for a fixture, used to decide who gets asked how it went. */
export async function selectedPlayers(fixtureId: string) {
  const rows = await db()
    .select({
      player_id: teamPlayers.player_id,
      is_sub: teamPlayers.is_sub,
      id: players.id,
      display_name: players.display_name,
      emoji: players.emoji,
      telegram_user_id: players.telegram_user_id,
      private_chat_id: players.private_chat_id,
    })
    .from(teamPlayers)
    .innerJoin(players, eq(players.id, teamPlayers.player_id))
    .where(eq(teamPlayers.fixture_id, fixtureId))
    // Added at N7. This had no ordering at all, so the questionnaire went out in
    // whatever order the plan happened to produce — harmless in effect, but it made
    // the result impossible to characterise and any regression invisible.
    .orderBy(asc(players.display_name));

  // Re-nested to the shape callers already consume: PostgREST returned the joined
  // player as an embedded object, and the bot reads `row.players.private_chat_id`.
  return rows.map((row) => ({
    player_id: row.player_id,
    is_sub: row.is_sub,
    players: {
      id: row.id,
      display_name: row.display_name,
      emoji: row.emoji,
      telegram_user_id: row.telegram_user_id,
      private_chat_id: row.private_chat_id,
    },
  }));
}

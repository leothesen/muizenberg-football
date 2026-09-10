import type { Commitment, RsvpStatus, SquadShape } from "@/domain/types";
import { db } from "@/lib/supabase";
import { type FixtureRsvpView, toCommitments } from "./mappers";

export async function listRsvps(fixtureId: string): Promise<FixtureRsvpView[]> {
  const { data, error } = await db()
    .from("v_fixture_rsvps")
    .select("*")
    .eq("fixture_id", fixtureId)
    // A stable order matters: the squad list is rendered straight from this.
    .order("squad_position", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function commitmentsFor(fixtureId: string): Promise<Commitment[]> {
  return toCommitments(await listRsvps(fixtureId));
}

/**
 * Records an answer. The in_since timestamp is stamped by a database trigger rather
 * than here, so the ordering that decides the squad cannot be forged by a caller.
 */
export async function setRsvp(
  fixtureId: string,
  playerId: string,
  status: RsvpStatus,
): Promise<void> {
  const { error } = await db()
    .from("rsvps")
    .upsert({ fixture_id: fixtureId, player_id: playerId, status }, { onConflict: "fixture_id,player_id" });
  if (error) throw error;
}

export async function markPromoted(fixtureId: string, playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return;
  const { error } = await db()
    .from("rsvps")
    .update({ promoted_at: new Date().toISOString() })
    .eq("fixture_id", fixtureId)
    .in("player_id", playerIds);
  if (error) throw error;
}

export function shapeOf(fixture: { players_per_team: number; subs_per_team: number }): SquadShape {
  return { playersPerTeam: fixture.players_per_team, subsPerTeam: fixture.subs_per_team };
}

/** Everyone in the league who has not answered this fixture yet — the nudge list. */
export async function silentPlayers(fixtureId: string) {
  const { data: answered, error: answeredError } = await db()
    .from("rsvps")
    .select("player_id")
    .eq("fixture_id", fixtureId);
  if (answeredError) throw answeredError;

  const answeredIds = new Set((answered ?? []).map((r) => r.player_id));

  const { data: everyone, error } = await db()
    .from("players")
    .select("*")
    .eq("is_active", true);
  if (error) throw error;

  return (everyone ?? []).filter((p) => !answeredIds.has(p.id));
}

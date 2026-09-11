import { and, eq, inArray, sql } from "drizzle-orm";
import type { Commitment, RsvpStatus, SquadShape } from "@/domain/types";
import { db } from "@/lib/db";
import { players, rsvps, vFixtureRsvps } from "@/lib/db/schema";
import { type FixtureRsvpView, toCommitments } from "./mappers";

export async function listRsvps(fixtureId: string): Promise<FixtureRsvpView[]> {
  const rows = await db()
    .select()
    .from(vFixtureRsvps)
    .where(eq(vFixtureRsvps.fixture_id, fixtureId))
    // A stable order matters: the squad list is rendered straight from this, and
    // squad_position is null for everyone who is not in, so they go last.
    .orderBy(sql`squad_position asc nulls last`);

  // `rating` is numeric, which the driver hands back as a string. PostgREST coerced
  // it; the domain compares and averages it, so it is coerced here instead.
  return rows.map((row) => ({
    ...row,
    rating: row.rating === null ? null : Number(row.rating),
  })) as FixtureRsvpView[];
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
  await db()
    .insert(rsvps)
    .values({ fixture_id: fixtureId, player_id: playerId, status })
    .onConflictDoUpdate({
      target: [rsvps.fixture_id, rsvps.player_id],
      set: { status },
    });
}

export async function markPromoted(
  fixtureId: string,
  playerIds: string[],
): Promise<void> {
  if (playerIds.length === 0) return;

  await db()
    .update(rsvps)
    .set({ promoted_at: new Date().toISOString() })
    .where(
      and(eq(rsvps.fixture_id, fixtureId), inArray(rsvps.player_id, playerIds)),
    );
}

export function shapeOf(fixture: {
  players_per_team: number;
  subs_per_team: number;
}): SquadShape {
  return {
    playersPerTeam: fixture.players_per_team,
    subsPerTeam: fixture.subs_per_team,
  };
}

/** Everyone in the league who has not answered this fixture yet — the nudge list. */
export async function silentPlayers(fixtureId: string) {
  const answered = await db()
    .select({ player_id: rsvps.player_id })
    .from(rsvps)
    .where(eq(rsvps.fixture_id, fixtureId));

  const answeredIds = new Set(answered.map((r) => r.player_id));

  // Guests are excluded on purpose. They have no Telegram account at all, so a nudge
  // would be a DM to nobody, or an ephemeral group message addressed to a null user
  // id — and the person who can actually chase them is whoever brought them.
  const everyone = await db()
    .select()
    .from(players)
    .where(and(eq(players.is_active, true), eq(players.is_guest, false)));

  return everyone
    .filter((p) => !answeredIds.has(p.id))
    .map((p) => ({ ...p, rating: Number(p.rating) }));
}

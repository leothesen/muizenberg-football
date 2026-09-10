import type { Commitment, PlayerLike, Position } from "@/domain/types";
import type { Database } from "@/lib/database.types";

export type PlayerRow = Database["public"]["Tables"]["players"]["Row"];
export type FixtureRow = Database["public"]["Tables"]["fixtures"]["Row"];
export type RsvpRow = Database["public"]["Tables"]["rsvps"]["Row"];
export type FixtureRsvpView = Database["public"]["Views"]["v_fixture_rsvps"]["Row"];

/**
 * Database rows carry nullable columns and stringly-typed enums; the domain does not.
 * Every crossing of that boundary happens here so the pure modules stay pure.
 */

export function toPlayerLike(row: PlayerRow): PlayerLike {
  return {
    id: row.id,
    displayName: row.display_name,
    emoji: row.emoji,
    rating: Number(row.rating),
    preferredPosition: row.preferred_position as Position,
  };
}

/**
 * Only rows that are actually "in" can become a commitment, and only if the trigger
 * stamped in_since. A row missing it is a bug, not a player, so it is dropped rather
 * than defaulted to the epoch — which would silently put them first in the queue.
 */
export function toCommitments(rows: FixtureRsvpView[]): Commitment[] {
  const commitments: Commitment[] = [];

  for (const row of rows) {
    if (row.status !== "in" || !row.in_since) continue;
    if (!row.player_id || !row.display_name) continue;

    commitments.push({
      player: {
        id: row.player_id,
        displayName: row.display_name,
        emoji: row.emoji ?? "⚽",
        rating: Number(row.rating ?? 65),
        preferredPosition: "anywhere",
      },
      inSince: new Date(row.in_since),
    });
  }

  return commitments;
}

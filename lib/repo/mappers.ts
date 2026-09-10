import type { Commitment, PlayerLike } from "@/domain/types";
import type { fixtures, players, rsvps, vFixtureRsvps } from "@/lib/db/schema";

/**
 * The row shapes the rest of the codebase sees.
 *
 * Inferred from the Drizzle schema rather than from Supabase's generated types, so
 * the schema file is now the single source of truth for what a row looks like.
 *
 * `rating` is overridden on purpose. It is `numeric` in Postgres, which the driver
 * hands back as a string, and the repo layer coerces it at the boundary — the type
 * says `number` because that is genuinely what a caller receives. Leaving it as
 * `string` would be accurate about the driver and wrong about the codebase.
 */
export type PlayerRow = Omit<typeof players.$inferSelect, "rating"> & {
  rating: number;
};

export type FixtureRow = typeof fixtures.$inferSelect;
export type RsvpRow = typeof rsvps.$inferSelect;

export type FixtureRsvpView = Omit<
  typeof vFixtureRsvps.$inferSelect,
  "rating"
> & { rating: number | null };

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
      },
      inSince: new Date(row.in_since),
    });
  }

  return commitments;
}

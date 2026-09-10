import { db } from "../supabase";

/**
 * The cheapest honest round trip to Postgres.
 *
 * `head: true` asks for the count and no rows, so this is a single index-only
 * count rather than a table scan — but it is still a genuine user query, which is
 * the part that matters for keeping a free Supabase project awake.
 */
export async function ping(): Promise<number> {
  const { count, error } = await db()
    .from("players")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`database ping failed: ${error.message}`);

  return count ?? 0;
}

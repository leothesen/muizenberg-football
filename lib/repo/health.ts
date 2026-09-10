import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";

/**
 * The cheapest honest round trip to Postgres.
 *
 * A bare `count(*)` with no predicate, which Postgres answers from an index rather
 * than by scanning — but it is still a genuine query, which is the part that matters
 * for a keepalive.
 *
 * This module was missed by the port entirely. It is not in `lib/repo`'s original
 * roster because it was added later, with the keepalive cron, and every milestone
 * named its files explicitly. Nothing noticed until `lib/supabase.ts` was deleted and
 * the import stopped resolving — which is a good argument for removing a dependency
 * rather than merely ceasing to use it.
 */
export async function ping(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(players);
  return row?.n ?? 0;
}

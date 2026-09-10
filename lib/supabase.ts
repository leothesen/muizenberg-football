import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { requireEnv } from "./env";

/**
 * The server's database handle.
 *
 * Always the service role: every base table has RLS enabled with no policies, so the
 * anon key can read nothing but the curated views. All writes happen here, on the
 * server, behind Telegram's own authentication.
 */

export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

export function db(): Db {
  if (cached) return cached;

  cached = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  return cached;
}

let cachedPublic: Db | null = null;

/**
 * The handle the public website reads through.
 *
 * The anon key, deliberately, even though the server could just as easily use the
 * service role. Every base table has RLS on with no policies, so this client can only
 * see the curated views — which means the pages physically cannot render a Telegram
 * user id, and the "these views are the public surface" claim is enforced by the
 * database rather than by remembering to be careful.
 */
export function publicDb(): Db {
  if (cachedPublic) return cachedPublic;

  cachedPublic = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  return cachedPublic;
}

/** Test seam: drop the memoised clients so new ones pick up changed env. */
export function resetDb(): void {
  cached = null;
  cachedPublic = null;
}

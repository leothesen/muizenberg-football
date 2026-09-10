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

/** Test seam: drop the memoised client so a new one picks up changed env. */
export function resetDb(): void {
  cached = null;
}

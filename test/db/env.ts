import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Load `.env.local` into `process.env`.
 *
 * Next.js does this itself, Vitest does not, and these tests talk to a real database
 * so they need the same credentials the app uses. Deliberately does not overwrite a
 * variable that is already set, so CI or a shell export always wins.
 */
export function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return; // Nothing to load is fine; the caller reports what is actually missing.
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * The database these tests read and reset directly, over a plain Postgres connection
 * rather than through the code under test.
 *
 * Defaults to the local Supabase stack's Postgres, which is the reference the
 * migration is measured against.
 */
export function referenceDatabaseUrl(): string {
  return (
    process.env.REFERENCE_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  );
}

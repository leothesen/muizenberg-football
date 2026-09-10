import { loadEnvLocal, referenceDatabaseUrl } from "./env";
import { databaseReachable } from "./reset";
import { ensureWebReader } from "./web-reader";

loadEnvLocal();

/**
 * Fail loudly, immediately, and with the connection string in the message.
 *
 * These are the tests that make the Supabase-to-Neon port safe: they are the only
 * thing standing between a rewritten query and a silent behaviour change. Skipping
 * them when the database happens to be down would turn the safety net into a
 * green tick that means nothing.
 */
if (!(await databaseReachable())) {
  throw new Error(
    [
      `No database at ${referenceDatabaseUrl()}.`,
      "",
      "This suite characterises the data layer against a real, seeded database.",
      "Start the reference stack with `pnpm db:start`, or point",
      "REFERENCE_DATABASE_URL somewhere that is running.",
    ].join("\n"),
  );
}

/**
 * Point Drizzle at the same database the suite resets.
 *
 * The port moves one module at a time, so for several milestones some queries go
 * through the Supabase client and some through `db()`. If those two talked to
 * different databases, a test that seeds one and reads the other would pass or fail
 * for reasons unrelated to the code being ported.
 *
 * Set DATABASE_URL yourself to override — the N4 seam tests do exactly that, because
 * they need the standalone Postgres where the role came from a real migration rather
 * than from the helper below.
 */
process.env.DATABASE_URL ??= referenceDatabaseUrl();

await ensureWebReader();

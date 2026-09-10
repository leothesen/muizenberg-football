import { loadEnvLocal, referenceDatabaseUrl } from "./env";
import { databaseReachable } from "./reset";

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

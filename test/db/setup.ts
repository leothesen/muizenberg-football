import { loadEnvLocal, testDatabaseUrl } from "./env";
import { databaseReachable } from "./reset";

loadEnvLocal();

/**
 * Fail loudly, immediately, and with the connection string in the message.
 *
 * These are the tests that made the Supabase-to-Neon port safe: they were the only
 * thing standing between a rewritten query and a silent behaviour change. Skipping
 * them when the database happens to be down would turn the safety net into a green
 * tick that means nothing.
 */
if (!(await databaseReachable())) {
  throw new Error(
    [
      `No database at ${testDatabaseUrl()}.`,
      "",
      "This suite exercises the data layer against a real, seeded database.",
      "Start it with `pnpm pg:start` and migrate with `pnpm drizzle:migrate`,",
      "or point TEST_DATABASE_URL somewhere that is running.",
    ].join("\n"),
  );
}

/**
 * The code under test reads the same database the suite resets.
 *
 * During the port this mattered a great deal — modules moved one at a time, so some
 * queries went through Supabase and some through `db()`, and a test that seeded one
 * database while reading the other would have proved nothing. There is one client
 * now, but the default still belongs here rather than in a developer's shell.
 *
 * Set DATABASE_URL yourself to override.
 */
process.env.DATABASE_URL ??= testDatabaseUrl();

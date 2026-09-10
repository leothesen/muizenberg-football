import type { Config } from "drizzle-kit";
import {
  checkMigrationTarget,
  describeConnection,
  resolveMigrationUrl,
} from "./lib/db/url";

/**
 * drizzle-kit's view of the database, used by `pull`, `generate` and `migrate`.
 *
 * `schemaFilter` matters more than it looks. Introspecting a Supabase database
 * without it drags in `auth`, `storage`, `realtime` and `graphql_public` — hundreds
 * of tables belonging to services this app has never used — and buries the twelve
 * that are actually ours.
 *
 * The connection string is resolved by `resolveMigrationUrl`, not by reading
 * `DATABASE_URL` directly, because migrations want the *direct* Neon endpoint while
 * the app wants the pooled one — see the comment on that function. Falling back to
 * local Docker keeps `pnpm drizzle:migrate` working in a fresh clone with no
 * environment at all.
 */

const url = (() => {
  try {
    return resolveMigrationUrl();
  } catch {
    return "postgresql://postgres:postgres@127.0.0.1:54332/muizenberg";
  }
})();

// Printed on every drizzle-kit run, and specifically into the Vercel build log. A
// fingerprint rather than the host, because Vercel redacts the host — see
// describeConnection. Two builds with the same fingerprint hit the same database.
console.log(`drizzle-kit → ${describeConnection(url)}`);

// A preview deployment must never migrate production. This throws rather than warns
// because the alternative is a build that succeeds while doing the one thing this
// arrangement exists to prevent.
const target = checkMigrationTarget(url);
if (target.message) console.log(target.message);
if (!target.ok) throw new Error(target.message);

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: { url },
} satisfies Config;

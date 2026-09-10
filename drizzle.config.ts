import type { Config } from "drizzle-kit";
import { describeConnection, resolveMigrationUrl } from "./lib/db/url";

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
// preview deployment migrating its own Neon branch and a preview deployment
// migrating production look identical until somebody can see the host.
console.log(`drizzle-kit → ${describeConnection(url)}`);

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: { url },
} satisfies Config;

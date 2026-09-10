import type { Config } from "drizzle-kit";

/**
 * drizzle-kit's view of the database, used by `pull`, `generate` and `migrate`.
 *
 * `schemaFilter` matters more than it looks. Introspecting a Supabase database
 * without it drags in `auth`, `storage`, `realtime` and `graphql_public` — hundreds
 * of tables belonging to services this app has never used — and buries the twelve
 * that are actually ours.
 */
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54332/muizenberg",
  },
} satisfies Config;

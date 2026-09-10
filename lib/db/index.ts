import { sql } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import { Pool as NeonPool } from "@neondatabase/serverless";
import * as schema from "./schema";
import { chooseDriver, resolveDatabaseUrl } from "./url";

/**
 * The database handles.
 *
 * Two of them, and the difference between them is the only thing standing between the
 * public website and a Telegram identifier.
 *
 * - `db()` connects as the owning role and does every write. Owners bypass RLS, which
 *   is how it can write to tables that have row-level security on with no policies.
 * - `readPublic()` runs inside a transaction that has dropped into `web_reader`, a
 *   role holding SELECT on the curated views and nothing else. A query that reaches
 *   for a base table is refused by Postgres rather than by anyone remembering.
 *
 * `web_reader` is NOLOGIN and has no password. Nothing connects as it — there is one
 * connection and one credential, and the privilege boundary is a transaction-scoped
 * `set local role` rather than a second secret to store and rotate.
 */

/**
 * Both drivers expose the same query builder, so the rest of the codebase can be
 * written against one type. The Neon handle is cast rather than unioned because a
 * union would force every call site to narrow something that never differs.
 */
export type Db = NodePgDatabase<typeof schema>;

let cached: Db | null = null;

export function db(): Db {
  if (cached) return cached;

  const url = resolveDatabaseUrl();

  if (chooseDriver(url) === "neon") {
    const pool = new NeonPool({ connectionString: url });
    cached = drizzleNeon({ client: pool, schema }) as unknown as Db;
  } else {
    const pool = new PgPool({ connectionString: url });
    cached = drizzlePg({ client: pool, schema });
  }

  return cached;
}

/** The role the public site reads as. Matches migration 0000. */
export const PUBLIC_ROLE = "web_reader";

/**
 * Run a read as `web_reader`.
 *
 * `set local` is scoped to the transaction, so the role is dropped again the moment
 * this returns — there is no way for a later query on the same pooled connection to
 * inherit it, which would be a far worse bug than the one this prevents.
 *
 * Anything that tries to read a base table in here throws `permission denied`. That
 * is the intended behaviour, not a fault: it is what makes "these pages cannot render
 * a Telegram id" a property of the database rather than a habit.
 */
export async function readPublic<T>(
  fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${PUBLIC_ROLE}`));
    return fn(tx);
  });
}

/** Test seam: drop the memoised handle so a new one picks up changed env. */
export function resetDb(): void {
  cached = null;
}

export { schema };

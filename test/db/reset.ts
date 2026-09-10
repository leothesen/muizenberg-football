import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { testDatabaseUrl } from "./env";

/**
 * Putting the database back to a known state, fast.
 *
 * Re-running every migration would do this too, but it takes
 * the better part of a minute. Truncating and re-seeding takes about a second and
 * lands in exactly the same place, because the seed is deterministic.
 */

/**
 * `badges` is a catalogue, populated by migration 0005 rather than by the seed.
 * Truncating it would leave nothing to restore it and every badge lookup would
 * quietly return nothing — a failure that looks like a bug in the code under test.
 */
const PRESERVED_TABLES = new Set(["badges"]);

let seedSql: string | null = null;

function seed(): string {
  seedSql ??= readFileSync(path.resolve(process.cwd(), "db/seed.sql"), "utf8");
  return seedSql;
}

async function baseTables(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );

  return rows
    .map((row) => row.table_name)
    .filter((name) => !PRESERVED_TABLES.has(name));
}

/**
 * Truncate everything the seed owns and replay it.
 *
 * One `truncate` for all tables at once, because truncating them one by one would
 * trip foreign keys no matter what order they were listed in.
 */
export async function resetToSeed(): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();

  try {
    const tables = await baseTables(client);
    const quoted = tables.map((name) => `public."${name}"`).join(", ");

    await client.query(`truncate ${quoted} restart identity cascade`);
    await client.query(seed());
  } finally {
    await client.end();
  }
}

/** Is there a database to talk to at all? Used to fail loudly rather than obscurely. */
export async function databaseReachable(): Promise<boolean> {
  const client = new Client({
    connectionString: testDatabaseUrl(),
    connectionTimeoutMillis: 2000,
  });

  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

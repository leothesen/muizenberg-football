import { Client } from "pg";
import { referenceDatabaseUrl } from "./env";

/**
 * Teach the reference database about `web_reader`.
 *
 * The migration is only half the story during the port. Modules move to Drizzle one
 * at a time, so for several milestones some queries go through the Supabase client
 * and some through `db()` — and they have to see *the same rows*, or a test that
 * resets one database and reads the other proves nothing at all.
 *
 * The answer is to point both at the same Postgres: the Supabase stack's, which is
 * plain Postgres 17 with a schema proved byte-identical in N2. The only thing it
 * lacks is the role, because Supabase's own migrations grant to `anon` and
 * `authenticated` instead. This adds it, mirroring what migration 0007 does.
 *
 * Idempotent, and it disappears at N12 when the reference stack does.
 */
export async function ensureWebReader(): Promise<void> {
  const client = new Client({ connectionString: referenceDatabaseUrl() });
  await client.connect();

  try {
    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'web_reader') then
          create role web_reader nologin;
        end if;
      end
      $$;
    `);

    await client.query("grant usage on schema public to web_reader");
    await client.query("grant web_reader to current_user");

    // Every curated view, discovered rather than listed: a view added by a later
    // migration would otherwise be silently unreadable and look like a port bug.
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name
         from information_schema.views
        where table_schema = 'public' and table_name like 'v\\_%'`,
    );

    for (const { table_name } of rows) {
      await client.query(
        `grant select on public."${table_name}" to web_reader`,
      );
    }
  } finally {
    await client.end();
  }
}

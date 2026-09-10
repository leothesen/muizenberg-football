# Migrations

Hand-written SQL, applied in order by `drizzle-kit migrate`, tracked in
`meta/_journal.json`.

These are the same eleven migrations the Supabase build used, unchanged apart from
the access model: every `grant ... to anon, authenticated` became
`grant ... to web_reader`, and `0000` creates that role. The schemas are identical —
`pg_dump --schema-only` of a freshly migrated database matches the Supabase one line
for line.

## Adding a migration

```bash
pnpm drizzle:generate --custom --name=what_it_does   # makes an empty .sql + journal entry
# write the SQL by hand
pnpm drizzle:migrate
```

**Never run `drizzle-kit generate` without `--custom`.** It works by diffing
`lib/db/schema.ts` against the snapshot in `meta/`, and because every migration here
is hand-written custom SQL, those snapshots describe an empty schema. A plain
`generate` would cheerfully emit `CREATE TABLE` for all thirteen tables, which then
fails against a database that already has them. The snapshots are an artefact of the
tool, not a description of reality — the `.sql` files are the truth.

## The access model

Two roles, and the split is the reason the public website cannot leak a Telegram id.

- The **owner** connects for every write, and bypasses RLS because owners always do.
- **`web_reader`** holds `SELECT` on the curated `v_*` views and nothing else. It is
  `NOLOGIN` and has no password: nothing connects as it. The server drops into it
  with `set local role web_reader` for the duration of a public read, so there is one
  credential to manage rather than two, and none of it lives in git.

Verified directly, not assumed — as `web_reader`, `select * from v_players_public`
returns rows, `select telegram_user_id from players` is `permission denied`, and so
is any write.

## Seeding

`db/seed.sql` invents sixteen players and four Wednesdays so the leaderboards have
something to render. It is deterministic — every value derives from an md5 of the
player's Telegram id and the week — so two fresh databases seed identically. It is
for development only and must never be applied to production.

`pnpm pg:setup` does the lot: reset, migrate, seed.

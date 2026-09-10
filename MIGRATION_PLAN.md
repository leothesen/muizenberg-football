# Migrating off Supabase onto Neon

Supabase's Free plan allows two projects across every organisation you own, and both
of Leo's are spoken for. Freeing one costs $25/month — real money for a test app that
serves sixteen people once a week. Neon's free tier (0.5 GB, 100 CU-hours per project,
scale-to-zero) is more headroom than this league will use in years.

## What is actually being replaced

Nothing that Supabase is famous for. There is **no Supabase Auth** here — Telegram is
the identity, verified by HMAC over `initData` and by OIDC for browser login, with our
own signed cookie. There is **no Storage** — leaderboards and player cards are rendered
on demand by `next/og` and streamed straight to Telegram, and a player's "avatar" is an
emoji they pick in Telegram. No Realtime, no Edge Functions, no RPC.

Three things do have to move:

1. **PostgREST.** The `.from().select()` builder is an HTTP query layer that Neon does
   not have. ~1,862 lines across ten files become SQL.
2. **The `anon` / `service_role` split.** Today RLS is on with no policies, so the
   website's anon key can read nothing but the curated `v_*` views — the public pages
   _physically cannot_ render a Telegram user id. That property is load-bearing and
   must survive as a read-only Postgres role, not as a promise to be careful.
3. **The Supabase CLI**, which is the entire local-dev and migration story.

## Decisions taken up front

- **Drizzle ORM** as the query layer. It replaces `lib/database.types.ts` (1,640
  generated lines) with a schema that _is_ the type source, and `drizzle-kit` replaces
  the Supabase CLI for migrations.
- **`drizzle-orm/neon-http` in production, `drizzle-orm/node-postgres` locally.** Same
  query code either side. The HTTP driver matters: a pooled Postgres client in a Vercel
  Function will exhaust connections, and PostgREST never had that problem because it
  was HTTP all along.
- **Raw SQL migrations for the views, grants and triggers.** The existing 860 lines are
  already correct and reviewed; re-expressing analytics views in a DSL would be
  churn with a chance of silent behaviour change.
- **The local Supabase Docker stack stays up as a reference oracle** until N12. Its
  Postgres on `:54322` holds the seeded four weeks, so every ported function can be
  diffed against the implementation it replaces rather than merely "looking right".

## Rules for the whole migration

- `pnpm verify` (lint + typecheck + test:run + build) green before **every** commit.
  Never leave `main` broken.
- Commit straight to `main`, tick the milestone in the same commit.
- **Port behaviour, not code.** Every ported function must be proved equivalent to the
  Supabase one against the same seeded database, not just proved to compile.
- Verify live over HTTP wherever practical. Running it for real has already caught the
  rating ratchet, two seed bugs and two silent Satori clips that tests did not.
- No positions, ever. Everyone plays everywhere and the keeper rotates.
- Team balance is by **average** rating per player, never total.

## Milestones

- [x] **N1 — Groundwork.** Add `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`
      and `pg`. A `docker-compose.yml` running plain `postgres:17` for local work.
      Introspect the live local database into a Drizzle schema so the tables and views
      are exact rather than retyped. Nothing consumes it yet; Supabase still serves
      every query. Verify green.

- [x] **N2 — Migrations.** Port the 860 lines of SQL to drizzle-kit. Same tables, same
      views, same triggers — but the RLS/`anon`/`service_role` block becomes a
      `web_reader` role holding SELECT on the `v_*` views and nothing else. Prove it:
      `pg_dump --schema-only` of a freshly migrated Postgres must match the current
      Supabase schema apart from the deliberate role changes. Port `seed.sql`.

- [ ] **N3 — Characterisation tests.** The safety net, written _before_ any rewrite.
      Cover every exported function in `lib/repo/*` and `lib/public/queries.ts` against
      the current Supabase implementation on the seeded local stack, pinning exact
      outputs. This layer has never had a single test; that is why it is the riskiest
      place in the codebase to touch and why this milestone comes first.

- [ ] **N4 — The database seam.** `lib/db.ts` exporting a writer handle and a
      `web_reader` handle, choosing driver by environment, reading `DATABASE_URL` with
      fallbacks to the names Vercel's Neon integration actually sets. Unit-tested for
      selection logic. Still consumed by nothing.

- [ ] **N5 — Port players and identity.** `lib/repo/players.ts`, `updates.ts`. N3 tests
      stay green unchanged — that is the acceptance criterion, not a new set of tests
      written to match the new code.

- [ ] **N6 — Port fixtures and RSVPs.** `fixtures.ts`, `rsvps.ts`. Includes the unique
      -by-kickoff idempotency the Tuesday cron depends on.

- [ ] **N7 — Port teams and reports.** `teams.ts`, `reports.ts`. Two of the four nested
      embeds live here and become explicit joins.

- [ ] **N8 — Port settlement, stats and backfill.** `settlement.ts`, `stats.ts`,
      `backfill.ts`. Order is load-bearing in settlement: score, then rating events
      skipping already-rated players, then badges, then `status='played'` last so a
      crash halfway is recoverable. Preserve it exactly.

- [ ] **N9 — Port the public site queries.** `lib/public/queries.ts`, all 423 lines,
      through the `web_reader` handle.

- [ ] **N10 — Retire the generated types.** Delete `lib/database.types.ts` and let
      Drizzle's inferred types carry it. Typecheck is the proof.

- [ ] **N11 — Prove the security property still holds.** A test asserting `web_reader`
      is _refused_ when it selects `players.telegram_user_id`, and a ported
      `scripts/check-site.mjs` grepping served HTML for every seeded Telegram id. The
      claim must be enforced by Postgres, exactly as it is today.

- [ ] **N12 — Excise Supabase.** Remove `@supabase/supabase-js`, the `supabase` dev
      dependency, `supabase/` config, `lib/supabase.ts`. Update `.env.example`. Stop
      the reference stack only once nothing needs it.

- [ ] **N13 — End to end on Neon.** Reset, backfill four weeks, then drive the real
      week over HTTP: `rsvp/open` → `nudge` → age the fixture → `teams/pick` →
      `reports/ask` → fill reports → `results/settle`. Compare the resulting tables
      against the numbers the Supabase build produced (9-8, MOTM Jonty, 11 rated, 17
      badges). Then `pnpm e2e`.

- [ ] **N14 — Deployment.** `vercel.json`, the environment table, `docs/DEPLOY.md` and
      `README.md` rewritten for Neon. Confirm against the real variable names the Neon
      integration set on the Vercel project.

## Where it stands

**N1 done.** Postgres 17.10 runs locally on `:54332` via `pnpm pg:start`, and
`lib/db/schema.ts` holds 13 tables and 17 views introspected from the live schema —
471 lines where `lib/database.types.ts` needed 1,640. Supabase still serves every
query; nothing consumes Drizzle yet. `pnpm verify` green, 503 tests.

Two things bit during N1 and are worth not rediscovering:

- **`pg_isready` lies while Postgres is initialising.** The image runs a temporary
  socket-only server to create the database, and a socket-based readiness check
  reports "accepting connections" against _that_. A wait loop falls straight through
  and the next command fails with `database "muizenberg" does not exist`. The
  healthcheck uses `-h 127.0.0.1` because nothing listens on TCP until the real
  server is up.
- **drizzle-kit 0.31.10 cannot generate an empty-string default.** It emitted
  `default(')` for `rating_events.reason`, an unterminated string literal. Every
  other string default in the schema round-tripped fine, so this is specifically the
  empty case. `lib/db/schema.ts` carries a header listing the hand-edits, because
  re-running `drizzle:pull` silently reverts them.

**N2 done.** The eleven migrations moved across unchanged apart from the access
model — 32 substitutions of `anon, authenticated` to `web_reader`, all 860 lines
accounted for — plus a new `0000` creating the role. `pnpm pg:setup` resets,
migrates and seeds from nothing in one command.

Proved rather than assumed:

- **The schemas are byte-identical.** `pg_dump --schema-only` of a freshly migrated
  Postgres against the Supabase original: 524 normalised lines each, zero diff.
- **The privilege boundary holds.** As `web_reader`, reading `v_players_public`
  works, `select telegram_user_id from players` is `permission denied for table
players`, and so is any write.
- **The seed is exact.** Telegram ids, display names and emoji checksum identically
  across both databases. The only divergence is settle-derived — the reference
  carries 75 rating events from the earlier end-to-end run, a fresh seed has none.

`web_reader` is **NOLOGIN with no password**. Nothing connects as it; the server
holds one connection as the owner and drops into the role with `set local role` for
public reads. One credential instead of two, and nothing to commit or rotate.

The local Supabase stack stays up as the reference oracle: four seeded weeks that
every ported function below N3 measures itself against.

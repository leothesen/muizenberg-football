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
- ~~`drizzle-orm/neon-http` in production~~ — **wrong, corrected at N4.**
  `neon-http` has no transaction support: `db.transaction()` typechecks and then
  throws "No transactions support in neon-http driver" at runtime. Public reads need
  a transaction, because that is the only scope `set local role web_reader` has, so
  this would have failed in production having passed every check here.
  **`drizzle-orm/neon-serverless` in production, `drizzle-orm/node-postgres`
  locally** — both support transactions, so the code path is identical either side.
  Connections still matter: the pooled Neon endpoint is preferred over the direct one
  precisely because a serverless function opening a connection per invocation runs
  out of them, which is the problem PostgREST never had because it was HTTP all along.
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

- [x] **N3 — Characterisation tests.** The safety net, written _before_ any rewrite.
      Cover every exported function in `lib/repo/*` and `lib/public/queries.ts` against
      the current Supabase implementation on the seeded local stack, pinning exact
      outputs. This layer has never had a single test; that is why it is the riskiest
      place in the codebase to touch and why this milestone comes first.

- [x] **N4 — The database seam.** `lib/db.ts` exporting a writer handle and a
      `web_reader` handle, choosing driver by environment, reading `DATABASE_URL` with
      fallbacks to the names Vercel's Neon integration actually sets. Unit-tested for
      selection logic. Still consumed by nothing.

- [x] **N5 — Port players and identity.** `lib/repo/players.ts`, `updates.ts`. N3 tests
      stay green unchanged — that is the acceptance criterion, not a new set of tests
      written to match the new code.

- [ ] **N6 — Port fixtures and RSVPs.** `fixtures.ts`, `rsvps.ts`. Includes the unique
      -by-kickoff idempotency the Tuesday cron depends on.

- [ ] **N7 — Port teams and reports.** `teams.ts`, `reports.ts`. Two of the four nested
      embeds live here and become explicit joins. **Give `selectedPlayers` an
      `ORDER BY`** — it has none today (see N3).

- [ ] **N8 — Port settlement, stats and backfill.** `settlement.ts`, `stats.ts`,
      `backfill.ts`. Order is load-bearing in settlement: score, then rating events
      skipping already-rated players, then badges, then `status='played'` last so a
      crash halfway is recoverable. Preserve it exactly.

- [ ] **N9 — Port the public site queries.** `lib/public/queries.ts`, all 423 lines,
      through the `web_reader` handle. **Give the unordered ones a total order** —
      `seasonTable`, `careerTable`, `fixtureStatRows`, `teamsForFixture` and
      `motmForFixture` have no `ORDER BY` anywhere today (see N3), so their row order
      is whatever the plan produces. Writing the SQL by hand makes fixing it free.

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

**N3 in progress.** The harness is built and the public site's fourteen queries are
covered: 26 database-backed tests, 2,099 lines of snapshot, proved reproducible over
three consecutive runs. `pnpm test:db` runs them; they are deliberately out of
`pnpm verify` so a fresh clone with nothing running still passes, and the suite
_fails loudly_ rather than skipping when no database is there.

How it works: `resetToSeed()` truncates and replays `db/seed.sql` in about 80ms —
`supabase db reset` would take a minute — and results are normalised before
snapshotting, because ids come from `gen_random_uuid()` and are new every reset. Ids
become `<uuid-1>`, `<uuid-2>` in first-seen order rather than being dropped, so a
join that pairs the wrong rows still fails.

Three things this turned up, none of which a compiler would have:

- **Five public queries have no `ORDER BY` at all** — not in the query, not in the
  view. `seasonTable`, `careerTable`, `fixtureStatRows`, `teamsForFixture` and
  `motmForFixture` come back in whatever order the plan produces, and it genuinely
  differs run to run. The domain layer sorts for leaderboards so it is cosmetic, but
  tied rows can swap places between page loads. N9 fixes it.
- **A `Date` snapshots as `{}`.** It has no own enumerable properties, so the
  normaliser walked straight past it and every `kickoffAt` compared equal to every
  other. A fixture scheduled on entirely the wrong day would have passed. Dates are
  now serialised, and `kickoffAt` shows real instants.
- **`in_since` is deliberately unreproducible.** The seed sets it relative to `now()`
  on purpose, so demo RSVPs rank correctly. Normalised — the ordering it drives is
  still visible in the order rows come back in.

**N3 continued.** 80 database-backed tests now, covering `lib/public/queries.ts` and
`lib/repo`'s stats, players, fixtures and rsvps. Write-path files reset before _each_
test rather than once per file — a reset is 80ms, which is cheaper than reasoning
about test order.

Two more things worth keeping:

- **The seed leaves next week's fixture already `open`**, not `scheduled`, so a demo
  has a poll to answer without waiting for Tuesday. A test written on the opposite
  assumption failed and was wrong, not the code.
- **Dropping out sends you to the back of the queue.** The `rsvps_touch_in_since`
  trigger clears `in_since` on anything but `in`, and re-stamps it on the way back —
  so in, out, in is a _new_ queue position. That is what "subs are whoever replied
  last" means in practice, and it lives in a trigger rather than in `setRsvp`, which
  only ever writes the status.

Anything clock-derived is compared rather than snapshotted. `in_since` comes from
`now()` inside that trigger, so pinning its value produced a suite that passed once
and failed on the next run.

**N3 done.** **All 69 exported functions** in `lib/repo/*` and `lib/public/queries.ts`
are covered: 121 database-backed tests (`pnpm test:db`) plus 8 pure ones in the main
suite, which is now 511. Checked mechanically rather than by eye — a script greps
every exported name and reports any with no test referencing it, and it comes back
empty. That check caught two the eye had missed, including `applySettlement`, the
one function that actually holds the write order.

Three more things the tests found:

- **`fixtureAwaitingSettlement` looks for `locked`, never `played`.** That is the
  whole recovery design surfacing: settling writes score, then ratings, then badges,
  and only then moves the fixture to `played`. Until that last write lands the
  fixture is still `locked` and the next run finishes it; once it lands, no run ever
  touches it again. A test written on the assumption it finds played fixtures failed,
  and the test was wrong.
- **`selectedPlayers` has no `ORDER BY` either**, and nests the player under
  `players` rather than on the row — so sorting the result by a top-level
  `display_name` was a silent no-op that left the unstable database order in place.
  Add it to N7's list alongside N9's five.
- **Sorting by `player_id` is never safe in a test.** Ids are regenerated on every
  reset, so a snapshot ordered by them shuffles between runs. Twice now the fix has
  been to resolve ids to display names first.

**N4 done.** `lib/db/` now holds the two handles: `db()` connects as the owner and
does every write, and `readPublic()` runs inside a transaction that has dropped into
`web_reader`. Nothing consumes either yet — Supabase still serves every query — so
the tree stays deployable. 129 database-backed tests, 522 in the main suite.

**`neon-http` was the wrong choice and only running it showed that.** It has no
transaction support at all; `db.transaction()` compiles and then throws at runtime.
Public reads need a transaction because `set local role` has no other scope, so the
original plan would have passed lint, typecheck, tests and build, and failed on the
first page render in production. `neon-serverless` supports transactions and is now
the production driver.

Four things the live seam test proves, rather than assumes:

- `readPublic` really does become `web_reader` — asserted on `current_user`, not
  just on "something threw". A typo in the role name also throws, and a test that
  only checks for rejection cannot tell the two apart.
- A base table is `permission denied for table players`. Drizzle wraps failures as
  "Failed query: ..." and hides the reason in `cause`, so the whole error chain is
  flattened before matching — otherwise the assertion would pass for a typo.
- The role is dropped again afterwards. A `set role` that leaked would hand every
  later query on that pooled connection the wrong identity, which is worse than the
  problem being solved.
- It is dropped after a _failed_ read too, so one denied render cannot poison the
  connection for everything after it.

**N5 done.** `players.ts` and `updates.ts` are on Drizzle; all 129 characterisation
tests pass **unchanged**, which is the entire point of having written them first.

Two things had to be settled before a single query could move:

- **Both clients must talk to the same database.** Modules move one at a time, so for
  several milestones some queries go through Supabase and some through `db()`. A test
  that resets one database and reads the other proves nothing. `DATABASE_URL` now
  defaults to the reference stack's Postgres and the suite teaches it about
  `web_reader`, so the two clients share rows until N12 retires the stack.
- **The Drizzle schema uses snake_case property names.** drizzle-kit emits camelCase,
  which would have made every query return `telegramUserId` where the codebase has
  always had `telegram_user_id` — breaking 1,862 lines of consumers and every
  snapshot. Renaming 143 properties once was far cheaper, and a port should change
  how a query is issued, not what it returns.

Two smaller notes. `numeric` comes back from Postgres as a **string**, because a
double cannot hold every value the type can; PostgREST coerced it on the way out and
Drizzle does not, so ratings are converted at the repo boundary — otherwise `"72.50"`
sorts before `"8.00"` and the balancer quietly produces nonsense. And BSD `sed` does
not honour `\b`, so the first pass of the rename silently missed several references;
the fix was to drop the word boundaries and check the result rather than trust the
command.

**The safety net was itself checked.** Breaking `display_name` in the ported
`ensurePlayer` on purpose failed exactly one test, and reverting restored it — so the
suite really does bind to the new code rather than passing out of habit.

Still on Supabase: `fixtures`, `rsvps`, `teams`, `reports`, `settlement`, `stats`,
`backfill`, `lib/public/queries.ts` and the two dev-only routes.

The local Supabase stack stays up as the reference oracle: four seeded weeks that
every ported function below N3 measures itself against.

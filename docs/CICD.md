# CI/CD

Three things happen automatically. A pull request gets its own database and its own
URL, production gets its migrations applied before the new code serves anybody, and
neither of those is allowed to happen if the migrations cannot survive being applied
to an empty database.

None of it needs a `VERCEL_TOKEN`, a `NEON_API_KEY`, or any secret in GitHub.

---

## The shape

| Who                        | Does what                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **Vercel git integration** | Builds and deploys every push. Untouched.                                                  |
| **The Neon integration**   | Creates a Neon branch per preview deployment and injects its connection string.            |
| **The build command**      | Runs `drizzle:migrate` against whatever database _this_ deployment was given, then builds. |
| **GitHub Actions**         | Refuses to let a bad migration get that far. Never deploys anything.                       |

The build command is the whole trick, and it is one line in `vercel.json`:

```json
"buildCommand": "pnpm drizzle:migrate && pnpm build"
```

### Why the migration lives in the build and not in a workflow

The obvious design is a GitHub Actions job that migrates the database and then lets
Vercel deploy. It is what lazy-surf-report does and it works, but it has a failure
mode that is very hard to see: **the job and the deployment can disagree about which
database they mean.** The workflow resolves a connection string from secrets, the
deployment resolves one from its injected environment, and nothing checks that those
two are the same database. When they drift, the workflow reports success while the
running app talks to an unmigrated database — which is exactly the outage this
repository already had, arriving by a different road.

Running the migration inside the build removes the question. The migration reads the
same environment the deployment will serve traffic with, in the same container, one
step earlier. A preview cannot migrate production because a preview was never given
production's connection string.

It also fails in the right direction. If the migration fails, the build fails, and a
deployment that would have served 500s is never promoted.

---

## Preview: a database per pull request

Push a branch, open a PR, and Vercel builds a preview. The Neon integration receives
a webhook from Vercel, creates a copy-on-write branch called `preview/<git-branch>`,
and injects that branch's connection string into that deployment only. Then the build
command migrates it.

So a PR that adds a migration gets a database with that migration applied and
production's data underneath it, and production never sees the migration until the PR
merges.

**This requires one toggle**, and it is the only manual setup step in this document.
In the Vercel dashboard, under the Neon integration's settings, preview branching
must be on (Neon's docs call it _Required → Preview_, with _Resource must be active
before deployment_ also enabled). Without it, preview deployments fall back to
whatever `DATABASE_URL` the Preview environment has — and if that happens to be
production's, a preview build will migrate production. Check it once.

The injected variables cannot be viewed in the project's environment variable
settings, because they only exist at deployment time. The way to confirm the toggle
is working is the build log: `drizzle-kit → <host>/<database>` is printed on every
run, and a preview's host must not be production's host.

Branches are deleted when their deployment is removed, which follows Vercel's
retention policy rather than the PR being closed — so expect them to outlive the
merge.

## Production: a merge to main

Merging to `main` triggers a production build. The build migrates production, then
builds, then deploys. There is no separate step and nothing to remember.

**Migrations must be backwards compatible with the code already running.** Between
the migration finishing and the new deployment being promoted, the _old_ code is
serving requests against the _new_ schema — a window of a minute or two. Adding
things is safe. Renaming or dropping a column that live code still selects is not;
that needs two deploys, one to stop using it and one to remove it.

---

## What CI actually checks

`.github/workflows/ci.yml`, on every PR and on `main`.

**`verify`** — `pnpm verify`: migration consistency, lint, types, 531 unit tests, and
a production build. No database.

**`migrations`** — the lane that exists because of the outage on 10 Sep 2026.
Against a genuinely empty Postgres, in this order:

1. Apply all 12 migrations. This is the state a new Neon project is in, and applying
   cleanly to it is not something the app's own tests can tell you.
2. Assert the `web_reader` role exists, by name. Its absence is precisely what a
   production 500 looked like: `set local role web_reader` is the first statement of
   every public read, so an unmigrated database fails before any query runs.
3. Apply them again. Every deployment re-runs `drizzle:migrate`, including redeploys
   and rollbacks, so "safe to apply twice" is a load-bearing property and not a nicety.
4. Seed, then run the 133 database-backed tests. A migration can apply cleanly and
   still not produce the schema the code expects; only these tell the difference.

**`e2e`** — migrate, seed, and run the 26 Playwright tests against a real build.

### The consistency check

`pnpm check:migrations`, part of `pnpm verify`, compares `drizzle/*.sql` against
`drizzle/meta/_journal.json`. drizzle-kit decides what to run from the journal and
never from the directory listing, so **a `.sql` file that is not in the journal is
not a migration** — it is an inert text file that will never be applied to anything,
and nothing else in the toolchain complains. The first symptom would be production
missing a table.

Make migrations with `pnpm drizzle:generate --custom`, which writes both halves. Never
plain `drizzle-kit generate`: the meta snapshots in this repo describe an empty
schema, so it would emit a migration that recreates the entire database.

---

## Pooled and unpooled

The app wants Neon's **pooled** endpoint — the host with `-pooler` in it — because a
serverless function opens a connection per invocation and runs out of them otherwise.

Migrations want the **direct** endpoint. Neon's pooler is PgBouncer in transaction
mode, which makes no promises about session state or multi-statement DDL, and `0000`
creates a role.

So `lib/db/url.ts` has two resolvers that read the same environment and deliberately
come to opposite conclusions — `resolveDatabaseUrl` for the app, `resolveMigrationUrl`
for drizzle-kit. There is a test that hands both of them one Neon environment and
requires them to disagree; if it ever goes green by them agreeing, one of the two
callers has quietly become wrong.

Migration order is `MIGRATION_DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
`POSTGRES_URL_NON_POOLING`, `DATABASE_URL`, `POSTGRES_URL`. The last two are a
fallback so local Docker — which sets one variable and has no pooler to avoid — needs
no extra setup.

---

## Things that will bite you

**Preview databases contain real data.** Neon branches are copy-on-write from
production, so a preview has every player's Telegram identifier in it. Preview
deployments are behind Vercel's deployment protection by default. Leave it that way.

**A preview can talk to the real bot.** If the Preview environment carries
`TELEGRAM_BOT_TOKEN` and `ADMIN_SECRET`, then `POST /api/admin/register` on a preview
URL will re-point the live webhook at that preview, and the group's bot will start
being served by a branch. Crons are production-only, so nothing does this on its own —
but do not run that route against a preview.

**A failed migration blocks the deploy.** That is intended, and it means a broken
migration on `main` stops production deploys until it is fixed forward. The CI
`migrations` job is what stops that reaching `main` in the first place, so do not
merge with it red.

**Vercel can skip a build.** If a build is skipped, its migration is skipped too.
Nothing currently sets `ignoreCommand`, so this does not happen today — but adding one
would silently couple "no source changes" to "no schema changes", and those are not
the same thing.

**Neon branch limits.** Every open PR holds a branch. If the Neon plan's branch limit
is hit, new preview deployments will fail to get a database and the build will fail on
the migrate step, which looks like a migration problem and is not.

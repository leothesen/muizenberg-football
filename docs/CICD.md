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

Neon's own guide tells you to set this in the dashboard, under Settings → Build and
Deployment Settings → Override. **Do not.** `vercel.json` takes precedence, and unlike
a dashboard field it is version controlled, reviewable, and travels with the branch —
a preview can change the build command in the same PR that needs the change. The build
log confirms which one won: it prints `Running "pnpm drizzle:migrate && pnpm build"`.

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

### This needs the Previews Integration, and it is not the one you already have

There are **two different Neon integrations** on Vercel and only one of them does
this:

| Integration                            | What it is                                    | Branches per preview?                   |
| -------------------------------------- | --------------------------------------------- | --------------------------------------- |
| Neon (Marketplace / Vercel-managed)    | The database itself, billed through Vercel    | Only with preview branching switched on |
| **Neon Postgres Previews Integration** | Links an existing Neon account to the project | **Yes — this is the one**               |

Adding the database from the Marketplace does not by itself give you a branch per
preview, and neither does the **Neon GitHub integration**. That one sets a
`NEON_API_KEY` secret and a `NEON_PROJECT_ID` variable on the repository and offers a
sample workflow; it can create a branch per pull request, but the connection string
only ever exists as a workflow output. Nothing hands it to the Vercel deployment, so
the preview site still talks to whatever `DATABASE_URL` Vercel gave it. Useful for
running migrations or a schema diff inside Actions. Not a substitute for this.

**Without the Previews Integration, a preview deployment inherits the Preview
environment's `DATABASE_URL` — usually production's — and the build migrates
production while reporting success.** This is not hypothetical. It is what the first
pull request in this repository did, on 10 Sep 2026. It happened to be harmless
because production needed those migrations anyway, and it would not be next time.

### Confirming which database a build used

`drizzle.config.ts` prints one line on every run:

```
drizzle-kit → neondb @ host#983801ab (direct)
```

**Not the host.** The first version printed the host and came out of the build log as
`[REDACTED]/neondb`, because the integration sets the host as its own environment
variable and Vercel's scrubber replaces it wherever it appears — so the one line added
to answer "which database was this?" could not answer it. A fingerprint is not a
substring of any secret, survives the scrubber, and still compares: **same fingerprint
means same database**. Read production's off a production build log, read the
preview's off a preview build log, and they must differ.

### The guard

Set `PRODUCTION_DB_FINGERPRINT` on the Vercel project to production's fingerprint —
all environments, since a hash is not a secret. Then any preview build that resolves
to production **fails instead of migrating it**:

```
Refusing to migrate: this is a preview deployment, but the database it was given is
production. ... Install the Neon Postgres Previews Integration on this Vercel project
and redeploy.
```

Leave it unset and the build says so explicitly rather than staying quiet — "I could
not check" and "I checked and it was fine" should not look the same in a log.

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

**`verify`** — `pnpm verify`: migration consistency, lint, types, 540 unit tests, and
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

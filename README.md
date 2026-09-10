# Muizenberg Football

A Telegram bot that gets sixteen people to a pitch in Muizenberg every Wednesday, and
a fantasy league that makes them want to come back.

There is no signup, no password and no account. Being in the group chat _is_ being in
the league — the bot notices you join and does the rest. Every statistic is
self-reported and unverified, on purpose: there is no referee on a Wednesday night,
and a system that tries to police honesty stops being fun.

## The week

| When          | What happens                                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tue 16:00** | The bot posts in the group asking who's keen. In / Out / Maybe buttons; the message edits itself into a live squad sheet as people answer, and pins itself.                                                                       |
| **Wed 09:00** | Anyone who hasn't answered gets a nudge — but only if the game is actually short.                                                                                                                                                 |
| **Wed 12:00** | Teams are picked and posted. Balanced on _average_ rating per player; subs are whoever replied last, never whoever is worst. If there aren't enough people the game is called off now, while everyone can still make other plans. |
| **Wed 20:00** | Everyone who played gets a DM: goals, assists, nutmegs, tackles, saves, the final score, and who else played well. Nine taps, one message that rewrites itself.                                                                   |
| **Thu 08:00** | The score is agreed from what people reported, ratings move, badges are handed out, and the match report goes to the group.                                                                                                       |

## What it does

- **Ephemeral messages.** Most "just for you" moments happen in the group but are
  visible only to one person — the welcome, your RSVP confirmation, your player card.
  No DM clutter, no chat clutter.
- **Rendered images.** FIFA-style player cards, the season table, the team sheet and
  the match report are drawn server-side with `next/og` and posted as pictures.
- **A Mini App.** Tap the menu button in Telegram and the league opens in-chat. No
  login screen — the signed `initData` Telegram hands the page _is_ the login.
- **Inline mode.** Type `@yourbot table` in any chat at all, including ones the bot
  has never been added to, and drop the league table into the conversation.
- **A website.** League table, player profiles with every game they've played,
  fixtures, match reports and an all-time hall of fame.

## Running it locally

You need Docker (for Postgres), Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local     # the local connection string is already correct
pnpm pg:setup                  # starts Postgres, applies migrations, seeds a season
pnpm dev
```

Then open <http://localhost:3000>. The seed gives you sixteen players and four played
Wednesdays, so the table and the cards have something real in them.

There is **no bot token needed**. With `TELEGRAM_BOT_TOKEN` unset every outbound
Telegram call is written to the database instead of being sent, and
<http://localhost:3000/dev/telegram> renders those calls as a working fake Telegram
chat — including ephemeral messages, which you can only otherwise see by being the one
person allowed to. Switch viewer with the picker at the top to prove it.

To watch a whole week go by in thirty seconds:

```bash
# The seeded season has already been played; replay it through the fantasy engine.
curl -X POST localhost:3000/api/dev/backfill

# Then drive the crons by hand (CRON_SECRET comes from .env.local).
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/rsvp/open
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/teams/pick
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/reports/ask
docker exec -i muizenberg_postgres psql -U postgres -d muizenberg \
  < scripts/fill-reports.sql          # answers the questionnaire for most of the squad
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/results/settle
```

## Checking it

```bash
pnpm verify      # lint + typecheck + unit tests + build. The gate for every commit.
pnpm e2e         # Playwright, against a production build
```

Two scripts check things a unit test structurally cannot, against a running dev server:

```bash
node scripts/check-site.mjs           # every page renders; no Telegram id is ever in the HTML
node scripts/check-miniapp-login.mjs  # signed initData is accepted, tampered initData is not
```

**`pnpm e2e` and `pnpm dev` cannot run at the same time** — Next 16 refuses a second
dev server in the same directory whatever port you give it. Stop the dev server first.

## Deploying

See [`docs/DEPLOY.md`](docs/DEPLOY.md). Short version: push to Vercel, set the
environment variables, point BotFather at it, and `POST /api/admin/register`.

Migrations are not a deployment step — the Vercel build command runs them, so every
deployment migrates the database it was handed: production on a merge to `main`, and
its own Neon branch on a pull request. [`docs/CICD.md`](docs/CICD.md) explains the
pipeline, the one toggle it depends on, and what CI refuses to let through.

## How it is put together

```
domain/      Pure logic, no database and no network. Squad and waitlist, team
             balancing, the rating engine, score consensus, badges, leaderboards,
             records, and the settlement that ties them together.
lib/bot/     What the group actually reads: message wording, the questionnaire state
             machine, the update router, inline mode.
lib/og/      The rendered images.
lib/auth/    Telegram as the only identity. initData verification, OIDC web login,
             and a signed session cookie.
lib/db/      The schema, and the two handles: db() writes as the owner, readPublic()
             reads as web_reader inside a transaction.
lib/repo/    The database boundary. Everything above this line is testable without one.
lib/public/  What the website reads — as web_reader, so it *cannot* see a Telegram
             identifier even by mistake.
app/         Routes: the site, the Mini App, the webhook, the crons, the images.
drizzle/     Migrations, hand-written SQL, applied with pnpm drizzle:migrate.
db/          The development seed.
```

Two rules worth knowing before changing anything:

1. **There are no positions.** Everyone plays everywhere and the keeper rotates. Saves
   are a statistic because anybody might end up in goal, not because anybody is a
   goalkeeper.
2. **The public surface is a set of curated views, enforced by Postgres.** The server
   connects as the owning role and does every write; every page read runs inside a
   transaction that has dropped into `web_reader`, which holds `SELECT` on those views
   and nothing else. A page that reached for a base table would be refused, so "the
   site cannot show a Telegram id" is a property of the database rather than a habit.
   `web_reader` is NOLOGIN and has no password — there is one connection string for
   the whole app.

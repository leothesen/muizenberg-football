# Deploying

Vercel, Neon and BotFather. Roughly twenty minutes, most of it waiting.

The order matters in one place only: **the bot cannot be registered until the site has
a URL**, because registration tells Telegram where the webhook lives. Everything else
can be done in any order.

## 1. A database

Add Neon from the Vercel Marketplace (Storage → Create Database → Neon). The
integration sets the connection variables on the project itself, so there is usually
nothing to copy by hand.

If you would rather create it at [neon.tech](https://neon.tech) directly, take the
**pooled** connection string — the host with `-pooler` in it — and set it as
`DATABASE_URL`. Pooled matters: a serverless function that opens a direct connection
per invocation runs out of them, and Neon's pooler exists precisely for this.

**The migrations apply themselves.** `vercel.json` sets the build command to
`pnpm drizzle:migrate && pnpm build`, so every deployment migrates the database it was
given before it builds — production on a merge to `main`, and its own Neon branch on a
preview. There is nothing to run and nothing to remember; a brand-new empty Neon
database is fully set up by the first deploy. See [CICD.md](./CICD.md) for why the
migration lives in the build command and what CI checks before it gets there.

To apply them by hand anyway — bootstrapping a database before any deploy exists, or
recovering one — point `DATABASE_URL` at it and run:

```bash
pnpm drizzle:migrate
```

Either way that applies every migration in `drizzle/`: the tables, the curated views,
the triggers, and the `web_reader` role the public site reads through. Use the
**direct** connection string here rather than the pooled one if you have both; Neon's
pooler is PgBouncer in transaction mode and migration `0000` creates a role.

The seed is **not** applied to production, and should not be — it invents sixteen
players and four Wednesdays. Your real players enrol themselves by being in the group.

### One connection string, two roles

There is no second credential to manage, which is the nicest thing about this setup.

The server connects as the owning role and does every write. Public page reads run
inside a transaction that has dropped into **`web_reader`**, a role holding `SELECT`
on the curated `v_*` views and nothing else — so those pages _physically cannot_
render a Telegram identifier, however carelessly they are written. `web_reader` is
`NOLOGIN` and has no password: nothing ever connects as it.

## 2. A bot

Talk to [@BotFather](https://t.me/botfather):

1. `/newbot` — gives you `TELEGRAM_BOT_TOKEN`.
2. `/setinline` — **required**, or `@yourbot table` does nothing in other chats.
3. Leave **privacy mode on** (the default). The bot only needs commands aimed at it
   and replies to its own messages, so there is no reason for it to read the group.

Then add the bot to your football group and **make it an admin** — it pins the Tuesday
poll so the poll stays reachable as the chat moves on, and without admin rights that
pin silently does nothing.

Now note the group's chat id, which is **negative**. Do this before step 4, while no
webhook exists — adding the bot generates a `my_chat_member` update all on its own,
and `getUpdates` will hand it straight back:

```bash
curl "https://api.telegram.org/bot<token>/getUpdates" \
  | jq '.result[].my_chat_member.chat // .result[].message.chat'
```

If that comes back empty, send `/help` in the group and run it again. Keep the minus
sign — a chat id that has lost it addresses a completely different chat.

This window closes the moment the webhook is set in step 4: Telegram will not serve
`getUpdates` and a webhook at the same time. If you miss it, the id also appears in
the webhook request log on Vercel.

Optional, only if you want desktop web login: in BotFather, under the bot's **Login
Widget** settings, register your site's origin and `https://<your-site>/api/auth/login/callback`
as an allowed redirect. That gives you `TELEGRAM_OAUTH_CLIENT_ID` and
`TELEGRAM_OAUTH_CLIENT_SECRET`. Without them the login page says so plainly and the
Mini App is unaffected.

## 3. Vercel

Import the repo. Framework is detected; no build settings to change.

Three of the variables below are just long random strings. Generate them:

```bash
for n in TELEGRAM_WEBHOOK_SECRET CRON_SECRET SESSION_SECRET; do
  echo "$n=$(openssl rand -hex 32)"
done
```

Set these environment variables:

| Variable                    | Notes                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | The **pooled** Neon connection string. Usually already set by the Neon integration — see the note below before adding it twice.    |
| `TELEGRAM_BOT_TOKEN`        | From BotFather                                                                                                                     |
| `TELEGRAM_WEBHOOK_SECRET`   | Any long random string. Telegram echoes it back so the webhook can prove an update really came from Telegram.                      |
| `TELEGRAM_LEAGUE_CHAT_ID`   | The group's chat id, negative                                                                                                      |
| `CRON_SECRET`               | Any long random string. Vercel sends it as `Authorization: Bearer …` on cron invocations.                                          |
| `SESSION_SECRET`            | Any long random string. Signs the session cookie; changing it logs everybody out.                                                  |
| `NEXT_PUBLIC_SITE_URL`      | `https://your-site.vercel.app`. Used to build the webhook URL, the Mini App URL and login redirects — **must** be the real origin. |
| `TELEGRAM_EMULATOR_ENABLED` | Set to `false`. Belt and braces: the emulator is already off whenever a bot token exists and `NODE_ENV` is production.             |

`TELEGRAM_OAUTH_CLIENT_ID` and `TELEGRAM_OAUTH_CLIENT_SECRET` only if you did the
Login Widget step.

### About the database variable

The app reads, in order: `DATABASE_URL`, `POSTGRES_URL`, `DATABASE_URL_UNPOOLED`,
`POSTGRES_URL_NON_POOLING`. The Neon integration sets several of these itself, so an
untouched integration works with nothing added by hand.

**Check which names your project actually has before setting `DATABASE_URL` yourself.**
Integrations have changed their naming before, and a hand-set variable wins over the
integration's — so a stale one you typed in March will quietly outrank the correct one
Neon is maintaining. If the integration set a pooled variable, leave it alone.

Deploy.

## 4. Register the bot

Once the site has a URL, tell Telegram about it:

```bash
curl -X POST https://<your-site>/api/admin/register \
  -H "Authorization: Bearer $CRON_SECRET"
```

That one call sets the command menus for group and private chats, points the menu
button at the Mini App, and sets the webhook with `allowed_updates` including
`chat_member` — which is what makes joining by invite link enrol somebody. It is
idempotent, so run it again any time the command list or the site URL changes.

## 5. Check it

- Send `/help` in the group. If the bot answers, the webhook works.
- Add somebody (or remove and re-add yourself). They should get a welcome only they
  can see.
- Tap the menu button. The Mini App should open straight to your card, no login.
- Type `@yourbot table` in any chat.

## Kickoff time and venue

Neither is an environment variable, so if your game is not Wednesday at six in a place
called Muizenberg, change them **before the first Tuesday** — after that there are
fixtures in the table carrying the old values.

- `DEFAULT_SCHEDULE` in `domain/schedule.ts` — the fallback hour (`18:00` league-local),
  the poll opening at `16:00` the day before, the squad locking at `12:00` on match
  day, and the questionnaire going out two hours after kickoff. The **weekday** there
  is only a last-resort default: see below.
- `NIGHT_OPTIONS` in `domain/nights.ts` — the nights the group can vote between, and
  the hour each one kicks off at.
- `DEFAULT_VENUE` in `domain/venues.ts` — Zandvlei Sports Ground and its coordinates.
  The fixtures table stores the venue *name*, and that string is the lookup key, so
  changing one without the other loses the map pin.

**You do not have to move the crons to move the game.** That used to be true and was
the single worst thing about the old setup: the match night lived in `vercel.json`, so
changing it needed a redeploy. The crons now run daily and each works out for itself
whether today is its day, by reading the fixture.

## Which night the game is on

Nobody sets this. Monday's poll asks the group, Tuesday morning reads the answers and
books the week.

- People tap **every** night they can play, not one — a single-choice poll splits
  "Wednesday or Thursday" into two losing halves.
- A poll nobody answers still books a game, on **the night the group last played**.
  Silence is the commonest outcome in a group this size and it must not mean a dead
  week.
- Saturday or Sunday clearing `WEEKEND_THRESHOLD` votes (six) books a *second* fixture
  that week, alongside the weeknight one. Both run the normal cycle.

## The crons

Vercel picks these up from `vercel.json`. All times are **UTC**, and the league runs
in `Africa/Johannesburg` (UTC+2), so the schedule reads two hours earlier than it
happens:

| Path                       | UTC          | Local       | Fires when                          |
| -------------------------- | ------------ | ----------- | ----------------------------------- |
| `/api/cron/keepalive`      | `0 5 * * *`  | Daily 07:00 | Always                              |
| `/api/cron/nights/ask`     | `0 15 * * 1` | Mon 17:00   | Always — posts the which-night poll |
| `/api/cron/nights/resolve` | `0 7 * * 2`  | Tue 09:00   | Always — books the week             |
| `/api/cron/rsvp/open`      | `0 14 * * *` | Daily 16:00 | The day before a kickoff            |
| `/api/cron/rsvp/nudge`     | `0 7 * * *`  | Daily 09:00 | Within 18h of a kickoff             |
| `/api/cron/teams/pick`     | `0 10 * * *` | Daily 12:00 | Once that fixture's RSVP has closed |
| `/api/cron/reports/ask`    | `0 18 * * *` | Daily 20:00 | 2h+ after a kickoff                 |
| `/api/cron/results/settle` | `0 6 * * *`  | Daily 08:00 | 12h+ after a kickoff                |

The two `nights/*` jobs are the only ones still pinned to a weekday, and that is
correct: the *game* moves, but the *asking* is weekly and needs a fixed day or there
is no week to ask about. Monday, because asking on a Tuesday has already ruled out
playing on the Tuesday.

South Africa does not observe daylight saving, so these do not drift. If the league
ever moves country, they will.

Every cron is idempotent: firing one twice does nothing the second time. The settle
cron in particular skips any player who already has a rating event for that fixture,
so a timeout halfway through is recovered by the next run rather than double-counting.

### On Vercel's Hobby plan

Two limits apply, and both are survivable here:

- **A cron may run at most once per day.** Every schedule above fires at most daily,
  so all eight deploy fine. An expression that would fire more than once a day is
  rejected at deploy time, not silently ignored.
- **Timing is only accurate to the hour: a job set for `0 14` fires somewhere between
  14:00 and 14:59.** The schedule has hours of slack between each step, so this
  changes nothing — but do not tighten the gaps on the assumption the times are exact.

### The keepalive is now only a canary

It was added because a Supabase Free project paused after a week without queries and
had to be restored **by hand** from the dashboard — a silent failure that would have
shown up as the Tuesday poll simply never appearing.

**Neon does not work that way.** Compute scales to zero after a few minutes idle and
the next query wakes it automatically; nothing has to be restored. So the keepalive no
longer protects against anything, and it is kept for one smaller reason: it is a
daily, trivial round trip to the database, and if it is red in the Vercel logs then
nothing else is going to work either. Delete it if you would rather have one less
cron — nothing depends on it.

## Working on it locally

No Docker-based database service to install beyond Postgres itself:

```bash
pnpm pg:setup   # start Postgres, migrate, seed — or run the three separately:
pnpm pg:start
pnpm drizzle:migrate
pnpm pg:seed

pnpm dev
```

Then `/dev/telegram` drives the whole bot against an emulator, with no token and no
group required.

### Adding a migration

```bash
pnpm drizzle:generate --custom --name=what_it_does   # empty .sql + journal entry
# write the SQL by hand
pnpm drizzle:migrate
```

**Never run `drizzle-kit generate` without `--custom`.** It diffs `lib/db/schema.ts`
against the snapshots in `drizzle/meta/`, and because every migration here is
hand-written custom SQL those snapshots describe an empty schema — a plain `generate`
would emit `CREATE TABLE` for all thirteen tables against a database that already has
them. The `.sql` files are the truth; the snapshots are an artefact of the tool.

## Things that will bite you

- **`role "web_reader" does not exist` means the database was never migrated.** Every
  page 500s, `/login` still works because it reads nothing, and the build is green —
  which makes it look like a code problem. It is not: `readPublic()` opens its
  transaction with `set local role web_reader`, so an empty database fails on the
  first statement, before any query reaches a missing table. The fix is to migrate it;
  since the build command does that now, a redeploy is usually enough.
- **`NEXT_PUBLIC_SITE_URL` must be the real origin.** The Mini App URL, the webhook URL
  and the OAuth redirect are all built from it. Wrong value, and registration
  cheerfully points Telegram somewhere that does not exist.
- **Inline mode is off until you run `/setinline`.** There is no error; `@yourbot`
  simply does nothing.
- **Use the pooled Neon endpoint.** The direct one works right up until enough
  functions run at once, and then it does not.
- **The production driver is `drizzle-orm/neon-serverless`, never `neon-http`.**
  `neon-http` has no transaction support at all: `db.transaction()` typechecks and
  then throws at runtime. Public reads need a transaction, because that is the only
  scope `set local role web_reader` has — so http would pass every check locally and
  fail on the first page render in production. `lib/db/url.ts` picks the driver from
  the host and this is written down there too.
- **Postgres returns `numeric` as a string.** Ratings are coerced at the repo
  boundary. Add a new numeric column and you have to do the same, or sorting and
  averaging break quietly rather than loudly.
- **Message effects are private chats only**, and their ids are not in the Bot API
  reference. The code already retries without the effect if Telegram rejects it.
- **Never run `pnpm dev` and `pnpm e2e` together** — Next 16 refuses a second dev
  server in the same directory, at any port, and `pnpm e2e` builds into the same
  `.next` the dev server is serving from.

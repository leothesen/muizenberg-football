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

Then, from this repo, with `DATABASE_URL` pointing at the new database:

```bash
pnpm drizzle:migrate
```

That applies every migration in `drizzle/`: the tables, the curated views, the
triggers, and the `web_reader` role the public site reads through.

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

- `DEFAULT_SCHEDULE` in `domain/schedule.ts` — Wednesday (`weekday: 3`) at `18:00`
  league-local, the poll opening at `16:00` the day before, the squad locking at
  `12:00` on match day, and the questionnaire going out two hours after kickoff.
- `venue` in `drizzle/0002_fixtures_and_rsvps.sql` defaults to `'Muizenberg'`. Change
  it with a new migration rather than by editing that one.

If you move the kickoff, the cron schedules below have to move with it — in UTC.

## The crons

Vercel picks these up from `vercel.json`. All times are **UTC**, and the league runs
in `Africa/Johannesburg` (UTC+2), so the schedule reads two hours earlier than it
happens:

| Path                       | UTC          | Local       |
| -------------------------- | ------------ | ----------- |
| `/api/cron/keepalive`      | `0 5 * * *`  | Daily 07:00 |
| `/api/cron/rsvp/open`      | `0 14 * * 2` | Tue 16:00   |
| `/api/cron/rsvp/nudge`     | `0 7 * * 3`  | Wed 09:00   |
| `/api/cron/teams/pick`     | `0 10 * * 3` | Wed 12:00   |
| `/api/cron/reports/ask`    | `0 18 * * 3` | Wed 20:00   |
| `/api/cron/results/settle` | `0 6 * * 4`  | Thu 08:00   |

South Africa does not observe daylight saving, so these do not drift. If the league
ever moves country, they will.

Every cron is idempotent: firing one twice does nothing the second time. The settle
cron in particular skips any player who already has a rating event for that fixture,
so a timeout halfway through is recovered by the next run rather than double-counting.

### On Vercel's Hobby plan

Two limits apply, and both are survivable here:

- **A cron may run at most once per day.** Every schedule above is weekly except the
  keepalive, which is daily, so all six deploy fine. An expression that would fire
  more than once a day is rejected at deploy time, not silently ignored.
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

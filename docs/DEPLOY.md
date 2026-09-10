# Deploying

Vercel, Supabase and BotFather. Roughly twenty minutes, most of it waiting.

The order matters in one place only: **the bot cannot be registered until the site has
a URL**, because registration tells Telegram where the webhook lives. Everything else
can be done in any order.

## 1. Supabase

Create a project at [supabase.com](https://supabase.com). Then, from this repo:

```bash
pnpm supabase link --project-ref <your-project-ref>
pnpm db:push
```

That applies every migration, including the row-level security that locks the base
tables and the curated views that are the public surface.

The seed is **not** applied to production, and should not be — it invents sixteen
players and four Wednesdays. Your real players enrol themselves by being in the group.

From the project's API settings you need:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server only. Never expose this; it bypasses RLS.

## 2. A bot

Talk to [@BotFather](https://t.me/botfather):

1. `/newbot` — gives you `TELEGRAM_BOT_TOKEN`.
2. `/setinline` — **required**, or `@yourbot table` does nothing in other chats.
3. Leave **privacy mode on** (the default). The bot only needs commands aimed at it
   and replies to its own messages, so there is no reason for it to read the group.

Then add the bot to your football group and note the chat id — it is negative for
groups. The simplest way to find it is to add the bot, send `/next`, and read the id
out of the webhook log once the site is up.

Optional, only if you want desktop web login: in BotFather, under the bot's **Login
Widget** settings, register your site's origin and `https://<your-site>/api/auth/login/callback`
as an allowed redirect. That gives you `TELEGRAM_OAUTH_CLIENT_ID` and
`TELEGRAM_OAUTH_CLIENT_SECRET`. Without them the login page says so plainly and the
Mini App is unaffected.

## 3. Vercel

Import the repo. Framework is detected; no build settings to change.

Set these environment variables:

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | From Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase. Server only. |
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Any long random string. Telegram echoes it back so the webhook can prove an update really came from Telegram. |
| `TELEGRAM_LEAGUE_CHAT_ID` | The group's chat id, negative |
| `CRON_SECRET` | Any long random string. Vercel sends it as `Authorization: Bearer …` on cron invocations. |
| `SESSION_SECRET` | Any long random string. Signs the session cookie; changing it logs everybody out. |
| `NEXT_PUBLIC_SITE_URL` | `https://your-site.vercel.app`. Used to build the webhook URL, the Mini App URL and login redirects — **must** be the real origin. |
| `TELEGRAM_EMULATOR_ENABLED` | Set to `false`. Belt and braces: the emulator is already off whenever a bot token exists and `NODE_ENV` is production. |

`TELEGRAM_OAUTH_CLIENT_ID` and `TELEGRAM_OAUTH_CLIENT_SECRET` only if you did the
Login Widget step.

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

## The crons

Vercel picks these up from `vercel.json`. All times are **UTC**, and the league runs
in `Africa/Johannesburg` (UTC+2), so the schedule reads two hours earlier than it
happens:

| Path | UTC | Local |
| --- | --- | --- |
| `/api/cron/rsvp/open` | `0 14 * * 2` | Tue 16:00 |
| `/api/cron/rsvp/nudge` | `0 7 * * 3` | Wed 09:00 |
| `/api/cron/teams/pick` | `0 10 * * 3` | Wed 12:00 |
| `/api/cron/reports/ask` | `0 18 * * 3` | Wed 20:00 |
| `/api/cron/results/settle` | `0 6 * * 4` | Thu 08:00 |

South Africa does not observe daylight saving, so these do not drift. If the league
ever moves country, they will.

Every cron is idempotent: firing one twice does nothing the second time. The settle
cron in particular skips any player who already has a rating event for that fixture,
so a timeout halfway through is recovered by the next run rather than double-counting.

## Things that will bite you

- **`NEXT_PUBLIC_SITE_URL` must be the real origin.** The Mini App URL, the webhook URL
  and the OAuth redirect are all built from it. Wrong value, and registration
  cheerfully points Telegram somewhere that does not exist.
- **Inline mode is off until you run `/setinline`.** There is no error; `@yourbot`
  simply does nothing.
- **The service role key bypasses RLS entirely.** It belongs only in Vercel's server
  environment. The website deliberately reads through the anon key so a mistake there
  cannot expose a Telegram identifier.
- **Message effects are private chats only**, and their ids are not in the Bot API
  reference. The code already retries without the effect if Telegram rejects it.
- **Never run `pnpm dev` and `pnpm e2e` together** — Next 16 refuses a second dev
  server in the same directory, at any port.

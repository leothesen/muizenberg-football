# Muizenberg Football — Build Plan

Single source of truth for the overnight build. Each iteration: pick the first
unchecked milestone, build it fully, get `pnpm lint` + `pnpm test:run` + `pnpm build`
green, commit to `main`, tick the box.

## Product in one line

A Telegram bot that gets 16 people to a pitch in Muizenberg every Wednesday, and a
fantasy league that makes them want to come back.

## Principles

1. **Attendance before vanity.** The RSVP machine is the part that would still be
   worth having if every other feature were deleted, so it ships first. See
   `docs/CHALLENGE_LOG.md`.
2. **Joining must be effortless.** Nobody signs up. Nobody sets a password. Being in
   the Telegram group *is* being in the league — the bot notices you and does the
   rest.
3. **Telegram is the product; the website is a window into it.** Anything that can
   happen in the chat happens in the chat, including pictures and private replies.
4. **Honesty-based.** Every stat is self-reported and unverified, on purpose.

## What the API actually allows

Verified against the reference on 9 Sep 2026 — see `docs/TELEGRAM_API.md`. The
finding that most changes the design: **ephemeral messages**. `sendMessage` and
`sendPhoto` accept `ephemeral_message_parameters`, so the bot can post into the group
a message only one named person can see, and edit or delete it afterwards. Most
"just for you" moments therefore need no DM and leave no clutter.

## Milestones

- [x] **M0 — Scaffold.** Next.js 16 + React 19 + Tailwind + Vitest + eslint flat
      config. lint/test/build green.
- [x] **M1 — Data model.** 12 tables + 12 curated views applied locally, 25 badges
      seeded, RLS locking every base table. Remaining: seed fixture data and
      generated row types.
- [x] **M2 — Domain core.** Pure logic + heavy unit tests. Done: squad capacity and
      waitlist, team balancing, rating engine. Remaining: badge engine, score
      consensus, fixture scheduling.
- [x] **M3 — Telegram transport.** Typed Bot API client covering the verified method
      set, webhook route with `secret_token` verification, update router, update
      de-duplication via `telegram_updates`, per-handler error isolation.
- [x] **M4 — Effortless onboarding.** The headline experience:
      - `chat_member` (explicitly requested in `allowed_updates`) and
        `message.new_chat_members` both auto-enrol whoever joins.
      - An **ephemeral** welcome in the group, visible only to the newcomer, with
        their name already filled in and one button to get going.
      - `answerCallbackQuery(show_alert)` for short private replies to a tap.
      - `setMyCommands` with scopes, plus `setChatMenuButton` pointing at the Mini
        App.
      - Deep link `t.me/<bot>?start=…` to capture a private chat id when a DM is
        genuinely needed.
- [x] **M5 — Telegram emulator.** Dev-only fake Telegram — including ephemeral
      rendering — so the whole bot is demoable locally with no bot token.
- [x] **M6 — RSVP flow.** Tuesday cron posts the poll; In/Out/Maybe inline buttons;
      the message edits itself into a live squad sheet and is pinned; capacity,
      waitlist and promotions; private ephemeral confirmations; `setMessageReaction`
      as an acknowledgement; nudges for the silent.
- [x] **M7 — Team selection.** Auto-balanced sides, subs decided by who replied last
      rather than by ability, team sheet posted before kickoff.
- [x] **M8 — Post-match capture.** Evening questionnaire as a button-driven state
      machine: goals, assists, nutmegs, tackles, final score consensus, and who else
      played well.
- [x] **M9 — Fantasy engine.** Ratings, form, leaderboards, awards, badges, team of
      the week, records, hall of fame.
- [x] **M10 — Rendered images.** Server-rendered PNGs via `next/og`: FIFA-style
      player cards, the leaderboard, the team sheet, the match report — posted with
      `sendPhoto`, and **ephemerally** when the card belongs to one person.
- [x] **M11 — Mini App + web login.** Two doors, one session:
      - **Mini App** in-chat, `initData` signed with `HMAC(bot_token, "WebAppData")`,
        opened from the menu button. No login screen.
      - **Web login** for a desktop browser. Note: this is *not* the old
        `SHA256(bot_token)` widget — that page is archived. It is now OpenID Connect
        with PKCE and an RS256 ID token checked against Telegram's JWKS.
- [x] **M12 — Public web app.** League table, player profiles, fixtures, records.
- [x] **M13 — Bot excellence.** Inline mode (`@bot table` in any chat) plus
      `switch_inline_query_chosen_chat` to share the table elsewhere; `disabled` and
      `copy_text` buttons; message effects on results; graceful errors, retries and
      rate-limit handling; a complete command set.
- [x] **M14 — Ship.** Vercel crons, env docs, README, Playwright e2e, deploy notes.

## Status log

- M0 done: Next 16.2.3 + React 19.2.3 + Tailwind 3.4.1 + Vitest 3 + eslint 9 flat
  config. lint/test/build all green.
- M1 mostly done: seven migrations applied to local Supabase (12 tables, 12 views,
  25 badges). `supabase start` must pass `--exclude vector` on this machine or the
  stack tears itself down.
- M2 in progress: `domain/squad.ts` (13 tests), `domain/teams.ts` (11 tests),
  `domain/rating.ts` written.
- Read the Bot API reference properly and wrote `docs/TELEGRAM_API.md`. Ephemeral
  messages exist and reshape the onboarding design; `sendChecklist` is business-only
  and unusable here.

- M1 done: 8 migrations, 12 tables + 12 views, 25 badges, generated row types in
  lib/database.types.ts, and a deterministic seed with four played Wednesdays plus one
  open fixture.
- Fixed a real waitlist bug: the squad view used rank(), so tied in_since values all
  ranked 1 and nobody was ever waitlisted. Now row_number() with player_id as the final
  tie-break, matching splitSquad().
- M2 done: squad, teams, rating, scoring, schedule and badges modules. 94 tests.

- M3 done: typed client, emulator transport, webhook route with secret-token auth
  and error isolation, update router with de-duplication. 149 tests.
- M4 done: joining the group enrols you and the welcome is an EPHEMERAL group message
  only the newcomer sees, with a deep link so the bot can DM them later.
- Added a verify script (lint + typecheck + test + build): tsc was catching type errors
  in test files that next build did not.

- M5 done: /dev/telegram renders the outbox as a real chat. The fold replays API calls
  (edits applied in place, deletes removed, reactions and pins attached) and the viewer
  switcher proves ephemeral messages are invisible to everyone else. Guarded by NODE_ENV
  AND the absence of a bot token.

- M6 done: Tuesday cron posts and pins the poll (idempotent at two layers), buttons edit
  the squad message in place, match-morning nudge chases only the silent and only when the
  game is actually short. Verified live: poll posted, second run skipped, 12 chased (11 DM,
  1 ephemeral).
- Found a two-hour bug in the seed: AT TIME ZONE binds tighter than + in Postgres.

- M7 done: midday cron picks balanced sides, posts the team sheet and locks the fixture,
  or calls the game off early enough for people to make other plans.
- Removed preferred positions entirely (Leo: everyone plays everywhere, keeper rotates).
  Saves stay as a stat because anybody might end up in goal.
- Balancing now minimises AVERAGE rating per player, not total. Live output exposed the
  bug: an 11-player split reported a gap of 31.5 because 6 players always out-total 5.
  Now 0.02.

- M8 done: evening cron DMs everyone who played; a nine-step questionnaire answered by
  tapping, rewriting one message in place. Verified live end to end: G2 A1 N3 T5, score
  6-4, self-rating 8, MOTM recorded, submitted.
- Added a flow state guard: Telegram leaves old keyboards tappable, so an out-of-order
  tap could otherwise write to a field the flow had passed, or skip questions.
- Fixed double escaping in the questionnaire (bold() already escapes its argument).
- Emulator now filters DMs by chat, and simulated callbacks carry the message they
  belong to — without it every in-place edit silently did nothing.
- NOT yet wired: settling the agreed score and marking the fixture played. That lands
  with M9, where reports roll up into the fantasy layer.

- M9 done. Thursday-morning cron settles the score from the reports, rates everyone who
  was selected, awards badges and posts the match report. `/table`, `/leaders`,
  `/records` and `/me` read it back; `/me` answers ephemerally in the group so everyone
  can check their own card without flooding the chat. 306 tests.
- **Found by running it, not by testing it: the rating engine was a ratchet.**
  `expectedPoints` used an absolute baseline of 2.5 against a league that routinely
  earns 10, so every player beat expectation every week: 37 of 64 rating changes hit the
  ±2.5 cap and the mean change was +1.98. Everyone would have reached 99 inside a
  season. Expectation is now the night's own average, so a rating means "better than the
  people you played with". Mean change is now −0.51 and the spread is 58.8–79.3.
- The seed only ever wrote team totals, never the per-player scorelines the
  questionnaire actually collects, so `agreeScore` had nothing to reconcile and every
  historical fixture settled scoreless. Fixed, with one player a week deliberately a
  goal out so the "12 of 16 agreed" path is exercised too.
- The seed also claimed to be deterministic and was not: it hashed `player_id`, a random
  uuid, so every reset produced a different league. Now keyed on `telegram_user_id`, and
  two resets were diffed to prove it.
- Added a dev-only backfill (`POST /api/dev/backfill`) that replays the engine over
  history. It un-settles everything first and replays oldest to newest, because career
  totals and streaks are read from played fixtures — otherwise August's badges would be
  decided by what happened in September.
- Verified live: 4 seeded weeks backfilled (64 rated, 83 badges), then a full week driven
  end to end — teams picked at a 0.01 rating gap, 11 asked, 9 answered, settled 9-8 with
  a man of the match and 17 badges. Re-running the settle on a fixture that was already
  settled left the league's total rating untouched at 1049.75 (`rated: 0,
  alreadyRated: 11`), which is the idempotency claim actually tested rather than asserted.

- M10 done: four rendered pictures — a FIFA-style player card, the season table, the
  team sheet and the match report — drawn with `next/og`, which needed no font or emoji
  configuration at all. The bot renders bytes in process and uploads them rather than
  handing Telegram a URL, so the images work identically on a laptop and on Vercel.
- Every illustrated message carries the text it would otherwise have sent and falls back
  to it, so a failed render is a plainer answer rather than no answer. `/me` sends the
  card **ephemerally**, and the fallback stays ephemeral too — a render failure must not
  be what leaks somebody's card to the group.
- Captions are authored short rather than truncated. Cutting an HTML message at 1024
  characters leaves a tag unclosed and Telegram rejects the whole message, so a caption
  is either something written for the job or the message stripped back to plain text,
  where truncation cannot break anything.
- **Satori clips silently, which is the trap in this milestone.** Both list images were
  sized by arithmetic that was too small, and the only symptom was a missing footer: the
  player card lost its "self-reported" line, the team sheet lost its balance note. Found
  by looking at the PNGs, not by any test — the render succeeded every time.
- The emulator now stores the actual PNG as a data URL and shows it, instead of
  recording "142108 bytes". The whole point of the emulator is seeing what the group
  would see, and a byte count does not tell you the footer was cut off.
- Verified live: `/table` and `/me` both went out as `sendPhoto` (the card with
  `receiver_user_id` set), the pick cron posted the team sheet with the real balance
  note, and the settle cron posted a 9-8 match report — each PNG decoded back out of the
  outbox and looked at.

- M11 done: Telegram is now the only auth on the web too. A Mini App at `/app` posts
  its signed `initData`, the server verifies it and issues a session cookie of our own;
  `/login` is the desktop door. 455 tests, 89 of them on the auth path alone.
- **The plan for this milestone was wrong and reading the docs caught it.** It said to
  verify the Login Widget against `SHA256(bot_token)`. That page is archived: Telegram
  web login is now OpenID Connect — authorization code with PKCE, then an RS256 ID
  token checked against `oauth.telegram.org/.well-known/jwks.json` with the bot id as
  the audience. Built to the current spec, on `node:crypto` rather than a JWT library.
- Second thing the docs settled: the Mini App data-check-string removes **only** `hash`.
  The newer `signature` field stays in. The Ed25519 third-party flow strips both, so
  copying that behaviour fails against real Telegram while passing every test built from
  the same wrong assumption. Pinned by name in a test.
- Local development had no bot token at all — that absence is what selects the emulator
  — so the Mini App login could only ever have been exercised in production. There is
  now a documented stand-in token and a dev route that mints properly signed `initData`
  with it. The signature is still verified; only the key differs, and both are
  unreachable once a real token exists or NODE_ENV is production.
- `/api/admin/register` finally calls `setMyCommands`, `setChatMenuButton` and
  `setWebhook`. Those existed on the client since M3 and nothing had ever invoked them,
  so the menu button that opens the Mini App did not exist. `allowed_updates` names
  `chat_member`, which a test pins: without it, joining by invite link is invisible and
  the product's main promise quietly stops working.
- Verified live over HTTP: valid initData signs you in, tampered initData is refused as
  `bad-signature`, `/api/auth/me` is gated, a bent session cookie is refused, logout
  clears it, and the registration route is 401 without the secret.

- M12 done: seven pages — home, table, players, a profile per player, fixtures, a match
  report per fixture, and the hall of fame. Server components throughout; the site ships
  no JavaScript to render a table of numbers.
- **The website reads through the anon key, not the service role.** It could just as
  easily have used the service role on the server and nobody would have noticed. Using
  anon means the pages *physically cannot* render a Telegram identifier — the base
  tables refuse the role outright — so the "these views are the public surface" claim is
  enforced by Postgres rather than by remembering to be careful. Confirmed both halves
  by hand: `v_season_table` reads fine, `players` comes back `42501 permission denied`.
- A live check walks every page and greps the served HTML for all sixteen seeded
  Telegram ids and for the column names themselves. That turns the claim above into a
  test rather than an intention.
- The Mini App sits outside the `(site)` route group, so it does not inherit the site's
  header and footer. Inside Telegram those would be somebody else's furniture in your
  app.
- Two things the browser caught that a build could not: the player profile rendered its
  attributes twice — once in the card image and again underneath it — and the hall of
  fame listed all eleven streak holders while every other record capped at three.
- Rating colours are defined twice by necessity, as Tailwind classes for the web and hex
  literals for Satori. A test now walks every band boundary and asserts the two agree.

- M13 done: inline mode, share-to-any-chat, state-aware buttons, paced fan-out and
  message effects. 503 tests.
- **Inline mode is the one part of the bot that works where the bot is not.** Typing
  `@thebot table` in a completely unrelated chat settles the argument without anybody
  being added to anything. Results are `article` rather than `photo`, because
  `InlineQueryResultPhoto.photo_url` has to be fetchable *by Telegram* — a photo result
  would be broken on a laptop and on every preview deployment, and would only work in
  production, which is the worst place to find that out.
- **The plan asked for message effects on results; the docs say they are private chats
  only.** So the group's match report cannot have confetti, and the effect went where
  it is allowed and where it is actually earned: the DM confirming a filed report, with
  fire for a hat-trick and something ruder for an own goal.
- The effect ids are not in the API reference at all — they are client constants that
  could be retired without notice, and an unknown one fails the whole `sendMessage`.
  So `sendWithEffect` retries without it. A bit of confetti must never cost somebody the
  message it was decorating.
- The RSVP button now knows what state the game is in: "I'm in" normally, "Join the
  waitlist" when full (still tappable — people drop out), and a greyed-out
  `disabled: {}` once teams are picked. Before this all three looked identical and
  tapping was the only way to find out which one you had.
- The two DM crons now go through `fanOut`, which spaces the sends, treats a 403 as
  "unreachable" rather than a failure, and stops on a 429 while reporting how many
  people were left unasked instead of throwing halfway through the squad.
- A test caught a real gap: `copyVenueButton` did not enforce Telegram's 256-character
  limit on `CopyTextButton.text`, and `venue` is an unbounded column — over the limit
  Telegram rejects the whole message rather than trimming the button.
- Unknown commands now answer in a private chat and stay silent in a group, where they
  were almost certainly meant for a different bot.
- Verified live: an inline query returned the real table, `/table` carried the share
  button with channels and bots excluded, and all three RSVP button states were driven
  through the emulator.

- M14 done. All fifteen milestones ticked. 503 unit tests, 26 Playwright tests across
  desktop and phone, `pnpm verify` green, and the whole week driven end to end.
- **The e2e suite runs against a production build, and that is a correctness
  requirement rather than an optimisation.** `next dev` inside a git worktree serves
  pages that never hydrate: client chunks come back 200, React boots, and no client
  component ever executes — with no error in the console, none on the server, and
  nothing in the network tab. Every server-rendered assertion passes and every
  interactive one fails, which reads exactly like an app bug. It is not one: the same
  page on `next start` hydrates perfectly, loads `telegram-web-app.js` and resolves.
  Two hours to find, and worth the note.
- Two neighbouring traps found along the way. Next 16 refuses to start a second
  `next dev` in the same directory whatever port it is given, so `pnpm dev` and
  `pnpm e2e` cannot run together. And Next infers its workspace root by walking up for
  a lockfile, so any checkout nested inside another one picks the *parent* — now pinned
  with `turbopack.root`, which also silences the warning on every build.
- The Mini App's Telegram script moved from `beforeInteractive` to `afterInteractive`
  with a short polled wait. Not the cause of the above — but blocking hydration on a
  third-party script means the page hangs on "Checking who you are…" anywhere
  telegram.org is slow or blocked, and the desktop path does not need the script at all.
- `check-site.mjs` was picking the *first* fixture link, and fixtures list upcoming
  before results — so it was testing the emptiest page on the site and calling it a
  pass. Now takes the last.
- README and `docs/DEPLOY.md` written for somebody who has to do this at eight in the
  morning: what the week looks like, how to run it with no bot token at all, and the
  five things that will bite during deployment.

## Where it stands

Everything works locally end to end. What it has never seen is a real Telegram group:
the bot token, the group chat id and the Vercel deployment are Leo's to add, and until
then every outbound call goes to the emulator. `docs/DEPLOY.md` is the path.

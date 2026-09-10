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
- [ ] **M11 — Mini App + web login.** Two doors, one `verifyTelegramSignature`:
      - **Mini App** in-chat, `initData` signed with `HMAC(bot_token, "WebAppData")`,
        opened from the menu button and `web_app` buttons. No login screen.
      - **Login Widget** for a desktop browser, verified against `SHA256(bot_token)`.
- [ ] **M12 — Public web app.** League table, player profiles, fixtures, records.
- [ ] **M13 — Bot excellence.** Inline mode (`@bot table` in any chat) plus
      `switch_inline_query_chosen_chat` to share the table elsewhere; `disabled` and
      `copy_text` buttons; message effects on results; graceful errors, retries and
      rate-limit handling; a complete command set.
- [ ] **M14 — Ship.** Vercel crons, env docs, README, Playwright e2e, deploy notes.

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

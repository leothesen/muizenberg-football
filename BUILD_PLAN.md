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
- [ ] **M1 — Data model.** 12 tables + 12 curated views applied locally, 25 badges
      seeded, RLS locking every base table. Remaining: seed fixture data and
      generated row types.
- [ ] **M2 — Domain core.** Pure logic + heavy unit tests. Done: squad capacity and
      waitlist, team balancing, rating engine. Remaining: badge engine, score
      consensus, fixture scheduling.
- [ ] **M3 — Telegram transport.** Typed Bot API client covering the verified method
      set, webhook route with `secret_token` verification, update router, update
      de-duplication via `telegram_updates`, per-handler error isolation.
- [ ] **M4 — Effortless onboarding.** The headline experience:
      - `chat_member` (explicitly requested in `allowed_updates`) and
        `message.new_chat_members` both auto-enrol whoever joins.
      - An **ephemeral** welcome in the group, visible only to the newcomer, with
        their name already filled in and one button to get going.
      - `answerCallbackQuery(show_alert)` for short private replies to a tap.
      - `setMyCommands` with scopes, plus `setChatMenuButton` pointing at the Mini
        App.
      - Deep link `t.me/<bot>?start=…` to capture a private chat id when a DM is
        genuinely needed.
- [ ] **M5 — Telegram emulator.** Dev-only fake Telegram — including ephemeral
      rendering — so the whole bot is demoable locally with no bot token.
- [ ] **M6 — RSVP flow.** Tuesday cron posts the poll; In/Out/Maybe inline buttons;
      the message edits itself into a live squad sheet and is pinned; capacity,
      waitlist and promotions; private ephemeral confirmations; `setMessageReaction`
      as an acknowledgement; nudges for the silent.
- [ ] **M7 — Team selection.** Auto-balanced sides, subs decided by who replied last
      rather than by ability, team sheet posted before kickoff.
- [ ] **M8 — Post-match capture.** Evening questionnaire as a button-driven state
      machine: goals, assists, nutmegs, tackles, final score consensus, and who else
      played well.
- [ ] **M9 — Fantasy engine.** Ratings, form, leaderboards, awards, badges, team of
      the week, records, hall of fame.
- [ ] **M10 — Rendered images.** Server-rendered PNGs via `next/og`: FIFA-style
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

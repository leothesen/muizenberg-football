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
   rest. The single most important interaction in the product is a stranger's first
   thirty seconds.
3. **Telegram is the product; the website is a window into it.** Anything that can
   happen in the chat should happen in the chat, including pictures.
4. **Honesty-based.** Every stat is self-reported and unverified, on purpose. Design
   for laughs, not for policing.

## Milestones

- [x] **M0 — Scaffold.** Next.js App Router + TS + Tailwind + ESLint + Prettier +
      Vitest. `pnpm lint`, `pnpm test:run`, `pnpm build` all green.
- [ ] **M1 — Data model.** Supabase local, migrations for players / seasons /
      fixtures / rsvps / squads / reports / badges / ratings, curated public views,
      locked-down RLS, seed data, generated row types.
- [ ] **M2 — Domain core.** Pure, dependency-free logic + heavy unit tests: squad
      capacity & waitlist, team balancing, rating engine, badge engine, score
      consensus.
- [ ] **M3 — Telegram transport.** Typed Bot API client, webhook route with secret
      token verification, update router, update de-duplication, error isolation.
- [ ] **M4 — Effortless onboarding.** The headline experience:
      - `new_chat_members` / `chat_member` → auto-enrol whoever joins the group.
      - A group welcome that is genuinely useful, with a one-tap deep link
        (`t.me/<bot>?start=…`) that opens a DM and captures their private chat id.
      - `answerCallbackQuery(show_alert)` for "only you can see this" replies to a
        button press inside the group.
      - `setMyCommands` + `setChatMenuButton` so the bot looks first-class.
      - Zero-question profile: name and avatar come from Telegram itself.
- [ ] **M5 — Telegram emulator.** Dev-only fake Telegram so the whole bot is
      demoable locally with no bot token and no group chat.
- [ ] **M6 — RSVP flow.** Tuesday cron posts the poll, inline In/Out/Maybe buttons,
      a self-editing live squad message, capacity, waitlist, promotions and nudges
      for the people who have not answered.
- [ ] **M7 — Team selection.** Auto-balancing from player ratings, subs, and a
      pre-kickoff team sheet posted to the group.
- [ ] **M8 — Post-match capture.** Evening DM state machine: goals, assists,
      nutmegs, tackles, final score consensus, and who else played well.
- [ ] **M9 — Fantasy engine.** Ratings, form, leaderboards, awards, badges, team of
      the week, records, hall of fame.
- [ ] **M10 — Rendered images.** Server-rendered PNGs posted straight into the chat:
      FIFA-style player cards, the leaderboard, the team sheet, the match report.
      Built on `next/og`, so no extra image toolchain.
- [ ] **M11 — Mini App + web login.** Two doors into the same house, sharing one
      `verifyTelegramSignature` module:
      - **Mini App** for in-chat use. Telegram hands the page `initData` signed with
        `HMAC(bot_token, "WebAppData")`; verified server-side, so a player is
        authenticated with no login screen at all. Reachable from the chat menu
        button and from `web_app` buttons on messages.
      - **Login Widget** for a plain desktop browser, verified against
        `SHA256(bot_token)`. Same trust root, no password anywhere.
- [ ] **M12 — Public web app.** League table, player profiles, fixtures, records,
      next match — the same data, readable in a browser.
- [ ] **M13 — Bot excellence.** Inline mode (`@bot table` in any chat), rich command
      set, graceful errors, rate-limit handling, retries, pinned live message.
- [ ] **M14 — Ship.** Vercel crons, env docs, README, Playwright e2e, deploy notes.

## Status log

- M0 done: Next 16.2.3 + React 19.2.3 + Tailwind 3.4.1 + Vitest 3 + eslint 9 flat
  config. lint/test/build all green.

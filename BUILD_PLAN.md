# Muizenberg Football — Build Plan

Single source of truth for the overnight build. Each iteration: pick the first
unchecked milestone, build it fully, get `pnpm lint` + `pnpm test:run` + `pnpm build`
green, commit to `main`, tick the box.

## Product in one line

A Telegram bot that gets 16 people to a football pitch in Muizenberg every Wednesday,
and a fantasy league that makes them want to come back.

## Ordering principle

Attendance before vanity. The RSVP machine is the part that would still be worth
having if every other feature were deleted, so it ships first. The fantasy layer is
the retention hook and ships second. The website ships last because the group lives
in Telegram, not in a browser. See `docs/CHALLENGE_LOG.md`.

## Milestones

- [ ] **M0 — Scaffold.** Next.js App Router + TS + Tailwind + ESLint + Prettier +
      Vitest. `pnpm lint`, `pnpm test:run`, `pnpm build` all green on an empty app.
- [ ] **M1 — Data model.** Supabase local, migrations for players / seasons /
      fixtures / rsvps / squads / match reports / results, seed data, typed row types.
- [ ] **M2 — Domain core.** Pure, dependency-free logic modules + heavy unit tests:
      squad capacity & waitlist, team balancing, rating engine, awards engine.
- [ ] **M3 — Telegram transport.** Typed Bot API client, webhook route with secret
      token verification, update router, base commands.
- [ ] **M4 — Telegram emulator.** Dev-only fake Telegram so the whole bot is
      demoable locally with no bot token and no group chat.
- [ ] **M5 — RSVP flow.** Tuesday cron posts the poll, inline In/Out/Maybe buttons,
      self-editing live squad message, capacity + waitlist + nudges.
- [ ] **M6 — Team selection.** Auto-balancing from player ratings, subs, Wednesday
      pre-kickoff post to the group.
- [ ] **M7 — Post-match capture.** Evening DM state machine: goals, assists, nutmegs,
      tackles, final score consensus, who played well.
- [ ] **M8 — Fantasy engine.** Ratings, form, leaderboards, awards, badges, team of
      the week, records, hall of fame.
- [ ] **M9 — Web app.** League table, player profiles, fixtures, records, next match.
- [ ] **M10 — Player cards.** Generated FIFA-style card images, posted into Telegram.
- [ ] **M11 — Ship.** Vercel crons, env docs, README, Playwright e2e, deploy notes.

## Status log

(append one line per iteration)

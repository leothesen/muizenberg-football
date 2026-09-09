# Challenge log

## 2026-09-09 — muizenberg-football overnight build

**Test fired:** MECHANISM. The ask named mechanisms ("Next.js app with Supabase
backend", "native Telegram integration", "fantasy league") rather than an outcome.

**Outcome restated:** make the Wednesday game easy to organise and fun enough that
people keep coming back.

**Strongest case this is the wrong problem:** the failure mode of a weekly social
kickabout is almost never missing statistics — it is not enough people turning up.
A fantasy league is a retention toy for a game that already has attendance. If the
real risk is nine players arriving for a sixteen-a-side, then goals, nutmegs and
FIFA cards are decoration on a game that has already fallen over, and the thing worth
building is a ruthless attendance machine: a hard RSVP deadline, automatic nudges to
the people who have not answered, a reserve list that gets pinged the moment someone
drops, and an early cancel that saves everyone's evening. Secondarily, the Next.js
web app risks never being opened at all — the group already lives in a Telegram chat,
so every hour spent on a website is an hour not spent making the bot delightful.

**Resolution:** accepted in part, and it changed the build order rather than the
scope. RSVP and attendance ship before the fantasy layer; the fantasy layer ships
before the website. If the night runs short, the part that survives is the part that
gets people to the pitch. Full scope still delivered as asked.

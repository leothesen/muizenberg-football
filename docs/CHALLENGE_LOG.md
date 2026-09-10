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

## 2026-09-10 — CI/CD, preview environments and a database per PR

**Test fired:** AGREEMENT. Three substantive turns without pushback — diagnosing the
outage, reading the Vercel logs, and building the pipeline — all in agreement.

**Outcome restated:** never again have a deployment whose schema does not match its
code, and be able to test a schema change before it reaches the league's real data.

**Strongest case this is the wrong problem:** this is a lot of pipeline for an app
that serves sixteen friends one evening a week and whose production database was
empty until today. Schema drift between environments is not what threatens this
project. What threatens it is that the bot has never once talked to a real Telegram
group on a real Wednesday — no token, no chat id, no webhook, not a single message
sent to an actual person. Every check in this workflow tests the app against a
database and none of them test it against Telegram, which is the entire product. The
build is insurance on the part of the system that already has 664 tests, bought
while the uninsured part has zero. If anything in this session should have been
deferred in favour of half an hour with BotFather, it was this.

**Resolution:** built as asked, and it is genuinely cheap to keep — no secrets, no
tokens, one line of build command. But it was written into the PR body and said
plainly here: the next hour is better spent getting the bot into the group than on
anything in this pipeline. The one thing that made this worth doing now rather than
later is that the same change fixes the live outage, because the first production
build to run under it migrates the empty database that caused it.

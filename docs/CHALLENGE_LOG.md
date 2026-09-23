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

## 2026-09-22 — the night poll at Monday 08:00, the squad list on Tuesday morning

**Test fired:** MECHANISM. The ask named two mechanisms — open the poll at 08:00
instead of 17:00, and post the "who's in?" list the moment the poll closes — rather
than an outcome. It came from a poll that closed on "3 votes for it".

**Outcome restated:** more of the group has a say in which night it is, and more of
them are on the squad list before teams are picked.

**Strongest case this is the wrong problem:** the window was probably not what kept
the count at three. "3 votes for it" is the winning night's tally, not the turnout,
and nobody looked at how many people voted in total before deciding the fix was more
hours. The poll is not pinned, nothing reminds anybody it exists, and a message
posted at 08:00 on a Monday sinks under a working day of chat exactly as the 17:00
one sank under an evening. If attention is the bottleneck, nine extra hours buy
nothing, and the fix is to pin the poll or nudge the silent the way the match-day
nudge already does. Beyond that, the vote rarely decides anything — silence repeats
the night last played, and the group plays Wednesdays — so the number that actually
decides whether there is a game is the squad list's, not the poll's. The second half
of this ask, asking who's in a day and a half earlier, is the half that matters, and
it would be worth measuring on its own.

**Resolution:** built as asked. Both halves are cheap and easy to reverse, and the
second one goes straight at the squad-list number. Pinning the night poll, and checking
the total vote count once a Monday-morning poll has run, were raised in the PR
as the next things to try if turnout doesn't move.

## 2026-09-23 — who's bringing a ball, and what time

**Test fired:** MECHANISM. The ask named two questions to add to the flow rather than
the outcomes behind them.

**Outcome restated:** there is always a ball at the pitch, and in summer the game
starts late enough for people to get there while still ending in daylight.

**Strongest case this is the wrong problem:** both could be solved without asking
anybody anything. A ball is a one-off purchase: the league buys two, somebody keeps
them in a car boot, and the question disappears for ever, where a weekly button has
to be answered correctly every single week. The time is the same shape. What the
group actually wants is "as late as the light allows", and the sun is predictable to
the minute, so the default could simply move with the season — 17:30 in winter, 18:30
by November — without a vote that a quiet group of 38 will rarely push past its
threshold. A time vote that never reaches three votes changes nothing, and a
seasonal default would have changed it by itself.

**Resolution:** built as asked, buttons only, no commands. The daylight calculation
the vote needs is also exactly what a seasonal default would need, so switching to
that later is a one-line change to what `resolveTime` falls back to. Both
alternatives were raised in the final report.

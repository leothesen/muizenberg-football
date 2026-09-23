import { NextResponse } from "next/server";
import { readTimeVote } from "@/domain/kickoff-times";
import { defaultNightFrom, resolveNights, weekStart } from "@/domain/nights";
import { nightPollKeyboard, nightPollMessage } from "@/lib/bot/night-poll";
import { focusPin, squadPollOutranksNightPoll } from "@/lib/bot/pin";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { claimNightPoll, nightPoll, timeVotesForWeek, votesForWeek } from "@/lib/repo/nights";
import { openFixture, recentKickoffs } from "@/lib/repo/fixtures";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monday morning: ask the group which night this week.
 *
 * This is the one cron that is genuinely pinned to a weekday, and the pinning is not
 * the thing the rest of this change removed. The *game* moves; the *asking* is weekly
 * and has to happen on a fixed day, or there is no week to ask about. Monday because
 * it leaves the whole week open — asking on a Tuesday would already have ruled out
 * playing on the Tuesday.
 *
 * 08:00 rather than the evening it used to be. Tuesday's booking cannot move later
 * without ruling out a Tuesday game, so the only way to give people longer to vote is
 * to ask earlier: a whole day, instead of sixteen hours that were mostly overnight.
 *
 * Idempotent on the week: night_polls has week_start as its primary key, so a second
 * firing loses the insert and deletes the message it just sent rather than leaving the
 * group with two polls disagreeing about the tally.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const chatId = leagueChatId();
  if (!chatId) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_LEAGUE_CHAT_ID is not set" },
      { status: 500 },
    );
  }

  const now = new Date();
  const week = weekStart(now);

  const existing = await nightPoll(week);
  if (existing?.message_id) {
    return NextResponse.json({ ok: true, skipped: "poll already posted", week });
  }

  const votes = await votesForWeek(week);
  const client = telegramClient();

  // The night the group last actually played, not a constant. A poll nobody answers
  // then repeats the real habit rather than whatever somebody typed once.
  const outcome = resolveNights(votes, defaultNightFrom(await recentKickoffs()));
  // And what time. The same message, because "which night" and "what time" are one
  // decision about one evening, and a second poll is a second thing to ignore.
  const time = readTimeVote(outcome.weeknight, await timeVotesForWeek(week), now);

  const message = await client.sendMessage({
    chat_id: chatId,
    text: nightPollMessage(outcome, time),
    parse_mode: "HTML",
    reply_markup: nightPollKeyboard(outcome.tally, time.outcome.tally),
  });

  const { created } = await claimNightPoll({
    weekStart: week,
    chatId,
    messageId: message.message_id,
  });

  if (!created) {
    // Another firing won the race. Two polls in the chat would each show half the
    // votes and neither would be right, so this one takes its own message back.
    try {
      await client.deleteMessage(chatId, message.message_id);
    } catch {
      // Deletion is best effort; a duplicate poll is bad but not worth a 500.
    }
    return NextResponse.json({ ok: true, skipped: "another run posted it first", week });
  }

  /*
    The week's first question takes the pin, and last week's game gives it up. Monday
    is where the stale pin was worst: the group was being asked which night this week
    while the top of the chat still advertised a game five days gone.

    Unless a game is already on. An ad hoc fixture called for a Tuesday has its squad
    list up before this runs, and "are you playing tomorrow" is a better use of the
    one line at the top of the screen than "which night next week". The vote is in the
    chat either way; the pin goes to whatever is nearest.
  */
  const deferred = squadPollOutranksNightPoll(await openFixture(), now);
  const pin = deferred
    ? null
    : await focusPin(client, { chatId, messageId: message.message_id });

  return NextResponse.json({
    ok: true,
    week,
    messageId: message.message_id,
    pinned: pin?.pinned ?? false,
    pinDeferred: deferred,
  });
}

import { NextResponse } from "next/server";
import { defaultNightFrom, resolveNights, weekStart } from "@/domain/nights";
import { nightPollKeyboard, nightPollMessage } from "@/lib/bot/night-poll";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { claimNightPoll, nightPoll, votesForWeek } from "@/lib/repo/nights";
import { recentKickoffs } from "@/lib/repo/fixtures";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monday: ask the group which night this week.
 *
 * This is the one cron that is genuinely pinned to a weekday, and the pinning is not
 * the thing the rest of this change removed. The *game* moves; the *asking* is weekly
 * and has to happen on a fixed day, or there is no week to ask about. Monday because
 * it leaves the whole week open — asking on a Tuesday would already have ruled out
 * playing on the Tuesday.
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

  const message = await client.sendMessage({
    chat_id: chatId,
    text: nightPollMessage(outcome),
    parse_mode: "HTML",
    reply_markup: nightPollKeyboard(outcome.tally),
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

  return NextResponse.json({ ok: true, week, messageId: message.message_id });
}

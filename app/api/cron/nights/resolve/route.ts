import { NextResponse } from "next/server";
import { readTimeVote, type KickoffTime } from "@/domain/kickoff-times";
import {
  defaultNightFrom,
  kickoffOn,
  resolveNights,
  weekStart,
  type NightOption,
} from "@/domain/nights";
import { scheduleFor } from "@/domain/schedule";
import { nightPollClosedMessage, nightsResolvedMessage } from "@/lib/bot/night-poll";
import { postSquadPoll } from "@/lib/bot/squad-poll";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { ensureFixture, ensureSeason, recentKickoffs } from "@/lib/repo/fixtures";
import type { FixtureRow } from "@/lib/repo/mappers";
import {
  markNightsResolved,
  nightPoll,
  timeVotesForWeek,
  votesForWeek,
} from "@/lib/repo/nights";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tuesday morning: read the votes, book the week, and ask who's in.
 *
 * A day after the poll goes up on Monday morning, which is late enough that most
 * people have seen it and early enough to still play on a Tuesday evening if that is
 * what won.
 *
 * The squad list goes up straight after the booking rather than the day before the
 * game. Once the night is fixed there is nothing left to wait for, and every hour the
 * list is not up is an hour nobody can say they're in.
 *
 * There is always a weeknight fixture. A poll nobody answered resolves to the usual
 * night rather than to nothing — that default is the entire reason this is safe to
 * build, because the commonest outcome in a group of 38 is silence, and silence must
 * not mean a dead week. A weekend fixture appears only when enough people asked.
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
  const poll = await nightPoll(week);

  if (poll?.resolved_at) {
    return NextResponse.json({ ok: true, skipped: "already resolved", week });
  }

  // Same fallback the poll message showed all week, so the announced result cannot
  // disagree with what the group was looking at.
  const outcome = resolveNights(
    await votesForWeek(week),
    defaultNightFrom(await recentKickoffs()),
  );
  // The weeknight only. A weekend game is its own afternoon with its own time, and
  // nobody voting for 18:30 after work meant a Saturday at 18:30.
  const time = readTimeVote(outcome.weeknight, await timeVotesForWeek(week), now).outcome;
  const season = await ensureSeason(now);

  const weeknight = await book(outcome.weeknight, now, season.id, time.time);
  const weekend = outcome.weekend ? await book(outcome.weekend, now, season.id) : null;

  // Marked before announcing. A failed send is recoverable — somebody asks /next —
  // whereas a second run booking the same week again is not, and the fixtures are
  // already written by this point. It is also what makes the bot refuse a late tap on
  // the poll, whether or not the edit below lands.
  await markNightsResolved(week);

  const client = telegramClient();
  const booked = {
    outcome,
    weeknightKickoff: weeknight.kickoffAt,
    weekendKickoff: weekend?.kickoffAt ?? null,
    time,
  };

  /*
    Close the poll. Rewritten with no keyboard, which is how Telegram removes one, so
    there is nothing left to tap; the text says it is closed and keeps the final count.
    This used to be skipped entirely, and the buttons stayed live all week.

    Best effort: the booking is written and the refusal above does not depend on it, so
    an edit Telegram rejects is not worth failing the announcement over.
  */
  if (poll?.chat_id != null && poll.message_id != null) {
    try {
      await client.editMessageText({
        chat_id: poll.chat_id,
        message_id: poll.message_id,
        text: nightPollClosedMessage(booked),
        parse_mode: "HTML",
      });
    } catch {
      // See above.
    }
  }

  await client.sendMessage({
    chat_id: chatId,
    text: nightsResolvedMessage(booked),
    parse_mode: "HTML",
  });

  /*
    Then ask who's in, and pin it. The weeknight only: a weekend game is a second
    fixture, and two sets of In / Out buttons pinned at once would leave people
    answering for the wrong game. Its list goes up the day before, from rsvp/open.

    Not caught. A failed send leaves the fixture with no list attached, which is
    exactly what rsvp/open looks for, so the day before still gets one — later than
    it should, but not lost, and the failed run shows up as a failed cron.
  */
  const squadMessageId = await postSquadPoll({
    client,
    chatId,
    fixture: weeknight.fixture,
    now,
  });

  return NextResponse.json({
    ok: true,
    week,
    squadMessageId,
    byDefault: outcome.byDefault,
    weeknight: { night: outcome.weeknight.key, kickoffAt: weeknight.kickoffAt.toISOString() },
    time: { at: time.time.label, byDefault: time.byDefault },
    weekend: outcome.weekend
      ? { night: outcome.weekend.key, kickoffAt: weekend!.kickoffAt.toISOString() }
      : null,
  });
}

async function book(
  option: NightOption,
  now: Date,
  seasonId: string,
  at?: KickoffTime,
): Promise<{ kickoffAt: Date; fixture: FixtureRow }> {
  const kickoffAt = kickoffOn(option, now, at);

  // ensureFixture is keyed on the kickoff instant, so booking a night that already has
  // a fixture — because somebody called one, or because last week's vote landed on the
  // same slot — returns the existing one rather than colliding. That existing one
  // may already have its squad list, which postSquadPoll then leaves alone.
  const { fixture } = await ensureFixture({
    seasonId,
    kickoffAt,
    rsvpClosesAt: scheduleFor(kickoffAt).rsvpClosesAt,
  });

  return { kickoffAt, fixture };
}

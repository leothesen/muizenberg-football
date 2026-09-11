import { NextResponse } from "next/server";
import { nextFixtureSchedule, rsvpWindowOpen } from "@/domain/schedule";
import { breakdownFrom, toFixtureLike } from "@/lib/bot/router";
import { rsvpKeyboard, squadMessage } from "@/lib/bot/messages";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import {
  attachRsvpMessage,
  ensureFixture,
  ensureSeason,
  openFixture,
} from "@/lib/repo/fixtures";
import { listRsvps } from "@/lib/repo/rsvps";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ask the group who is keen, the day before whenever the game is.
 *
 * This runs every day and decides for itself whether today is the day, rather than
 * being pinned to a weekday in vercel.json. The crontab used to encode "Tuesday",
 * which quietly made the match night part of the deploy: moving the game to a
 * Thursday would have needed a redeploy, and a group that votes on the night could
 * never have worked. Now the fixture says when it is and this reads the fixture.
 *
 * Idempotent in three layers, because a cron that fires twice must not produce two
 * polls: the fixture is unique by kickoff time at the database level, a fixture that
 * already carries an rsvp_message_id is left alone, and asking before the window
 * opens is a no-op.
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

  // A fixture the group already put on the books — because they voted on a night, or
  // because somebody called an ad hoc game — outranks the default weekly slot. Only
  // when there is nothing at all does this fall back to booking the usual night.
  const booked = await openFixture();
  let fixture = booked;
  let created = false;

  if (!fixture) {
    const schedule = nextFixtureSchedule(now);
    const season = await ensureSeason(now);
    ({ fixture, created } = await ensureFixture({
      seasonId: season.id,
      kickoffAt: schedule.kickoffAt,
      rsvpClosesAt: schedule.rsvpClosesAt,
    }));
  }

  // The day before the game, whenever that is. Running daily means this is the guard
  // that used to be a weekday in the crontab.
  if (!rsvpWindowOpen(new Date(fixture.kickoff_at), now)) {
    return NextResponse.json({
      ok: true,
      skipped: "too early to ask",
      fixtureId: fixture.id,
      kickoffAt: fixture.kickoff_at,
    });
  }

  if (fixture.rsvp_message_id) {
    return NextResponse.json({
      ok: true,
      skipped: "poll already posted",
      fixtureId: fixture.id,
    });
  }

  const rsvps = await listRsvps(fixture.id);
  const client = telegramClient();

  const message = await client.sendMessage({
    chat_id: chatId,
    text: squadMessage(toFixtureLike(fixture), breakdownFrom(rsvps), now),
    parse_mode: "HTML",
    reply_markup: rsvpKeyboard(fixture.id),
  });

  await attachRsvpMessage(fixture.id, chatId, message.message_id);

  // Pinned so it stays reachable as the chat moves on; silently, because the poll
  // itself is the notification.
  try {
    await client.pinChatMessage(chatId, message.message_id);
  } catch {
    // Pinning needs admin rights the bot may not have. Not worth failing the run.
  }

  return NextResponse.json({
    ok: true,
    fixtureId: fixture.id,
    fixtureCreated: created,
    messageId: message.message_id,
    kickoffAt: fixture.kickoff_at,
  });
}

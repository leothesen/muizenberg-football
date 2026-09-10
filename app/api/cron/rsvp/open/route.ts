import { NextResponse } from "next/server";
import { nextFixtureSchedule } from "@/domain/schedule";
import { breakdownFrom, toFixtureLike } from "@/lib/bot/router";
import { rsvpKeyboard, squadMessage } from "@/lib/bot/messages";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { attachRsvpMessage, ensureFixture, ensureSeason } from "@/lib/repo/fixtures";
import { listRsvps } from "@/lib/repo/rsvps";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tuesday afternoon: ask the group who is keen.
 *
 * Idempotent in two layers, because a cron that fires twice must not produce two
 * polls. The fixture is unique by kickoff time at the database level, and a fixture
 * that already carries an rsvp_message_id is left alone.
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
  const schedule = nextFixtureSchedule(now);
  const season = await ensureSeason(now);

  const { fixture, created } = await ensureFixture({
    seasonId: season.id,
    kickoffAt: schedule.kickoffAt,
    rsvpClosesAt: schedule.rsvpClosesAt,
  });

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
    kickoffAt: schedule.kickoffAt.toISOString(),
  });
}

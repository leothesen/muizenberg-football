import { NextResponse } from "next/server";
import { firstState, openingMessage, questionFor } from "@/lib/bot/report-flow";
import { questionContext } from "@/lib/bot/report-services";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { fixtureAwaitingReports } from "@/lib/repo/fixtures";
import { ensureReport, setFlowState } from "@/lib/repo/reports";
import { selectedPlayers } from "@/lib/repo/teams";
import { fanOut } from "@/lib/telegram/fan-out";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Match night: ask everybody who played how it went.
 *
 * Sent as a DM rather than into the group, because the questions are personal and
 * because twenty people answering in the group would be unreadable. Anyone the bot
 * has never spoken to privately cannot be reached, and is counted rather than
 * silently dropped.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const now = new Date();
  const fixture = await fixtureAwaitingReports(now);
  if (!fixture) {
    return NextResponse.json({ ok: true, skipped: "no fixture awaiting reports" });
  }

  const client = telegramClient();
  const players = await selectedPlayers(fixture.id);

  // Paced rather than fired all at once: a dozen DMs in a tight loop is exactly the
  // shape Telegram throttles, and a 429 halfway through would leave the rest of the
  // squad unasked with no record of who was missed.
  const result = await fanOut(players, async (entry) => {
    const player = entry.players;
    if (!player?.private_chat_id) return null;

    const report = await ensureReport(fixture.id, player.id);
    if (report.submitted_at) return null;

    const context = await questionContext(fixture.id, player.id);
    const question = context ? questionFor(firstState(), context) : null;
    if (!question) return null;

    await client.sendMessage({
      chat_id: player.private_chat_id,
      text: openingMessage(player.display_name),
      parse_mode: "HTML",
    });

    const sent = await client.sendMessage({
      chat_id: player.private_chat_id,
      text: question.text,
      parse_mode: "HTML",
      reply_markup: question.keyboard,
    });

    // Remember which message to rewrite as they answer.
    await setFlowState(report.id, firstState(), sent.message_id);
    return player.id;
  });

  return NextResponse.json({
    ok: true,
    fixtureId: fixture.id,
    asked: result.delivered.length,
    unreachable: result.unreachable,
    failed: result.failed,
    throttled: result.throttled,
  });
}

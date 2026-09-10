import { NextResponse } from "next/server";
import { squadHealth } from "@/domain/squad";
import { nudgeMessage, shouldNudge } from "@/lib/bot/nudge";
import { rsvpKeyboard } from "@/lib/bot/messages";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { openFixture } from "@/lib/repo/fixtures";
import { commitmentsFor, shapeOf, silentPlayers } from "@/lib/repo/rsvps";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Match-day morning: chase whoever has not answered.
 *
 * Silence is the real enemy of a social league — far more games die from nobody
 * replying than from people saying no.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const chatId = leagueChatId();
  const fixture = await openFixture();

  if (!fixture || !chatId) {
    return NextResponse.json({ ok: true, skipped: "no open fixture" });
  }

  const shape = shapeOf(fixture);
  const health = squadHealth(await commitmentsFor(fixture.id), shape);

  if (!shouldNudge(health)) {
    return NextResponse.json({ ok: true, skipped: "squad is healthy", health });
  }

  const now = new Date();
  const client = telegramClient();
  const silent = await silentPlayers(fixture.id);

  let dms = 0;
  let ephemeral = 0;
  let failed = 0;

  for (const player of silent) {
    const text = nudgeMessage({
      firstName: player.display_name,
      kickoffAt: new Date(fixture.kickoff_at),
      now,
      health,
    });

    try {
      if (player.private_chat_id) {
        // A DM actually notifies. Preferred whenever the bot has ever spoken to them.
        await client.sendMessage({
          chat_id: player.private_chat_id,
          text,
          parse_mode: "HTML",
          reply_markup: rsvpKeyboard(fixture.id),
        });
        dms += 1;
      } else {
        // No private chat yet: an ephemeral group message reaches them the next time
        // they open the chat, without bothering anybody else.
        await client.sendEphemeral(chatId, player.telegram_user_id, text, {
          replyMarkup: rsvpKeyboard(fixture.id),
        });
        ephemeral += 1;
      }
    } catch {
      // One blocked or unreachable player must not stop the rest of the round.
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, chased: silent.length, dms, ephemeral, failed });
}

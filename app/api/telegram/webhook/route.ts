import { NextResponse } from "next/server";
import { leagueChatId, optionalEnv } from "@/lib/env";
import { handleUpdate, updateKind } from "@/lib/bot/router";
import { liveServices } from "@/lib/bot/services";
import { liveReportDeps } from "@/lib/bot/report-services";
import { liveFantasyDeps } from "@/lib/bot/fantasy-services";
import { livePictureDeps } from "@/lib/bot/pictures";
import { toggleNightVote, votesForWeek } from "@/lib/repo/nights";
import { attachRsvpMessage, bookFixture } from "@/lib/repo/fixtures";
import { cachedInviteLink, rememberInviteLink } from "@/lib/repo/invite";
import { telegramClient } from "@/lib/telegram/factory";
import type { TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
// Webhook deliveries must never be served from a cache.
export const dynamic = "force-dynamic";

/**
 * Telegram's webhook.
 *
 * Two things matter here and nothing else does. Requests are authenticated by the
 * secret token Telegram echoes back, because this URL is public. And the response is
 * 200 whatever happens downstream: Telegram redelivers on any non-2xx, so letting a
 * handler error escape would turn one bad update into an endless retry loop.
 */
export async function POST(request: Request): Promise<Response> {
  const expected = optionalEnv("TELEGRAM_WEBHOOK_SECRET");
  const provided = request.headers.get("x-telegram-bot-api-secret-token");

  if (expected && provided !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (typeof update?.update_id !== "number") {
    return NextResponse.json({ ok: false, error: "not an update" }, { status: 400 });
  }

  try {
    await handleUpdate(
      {
        client: telegramClient(),
        services: liveServices(),
        reports: liveReportDeps(),
        fantasy: liveFantasyDeps(),
        pictures: livePictureDeps(),
        nights: { toggleNightVote, votesForWeek },
        fixtures: { bookFixture, attachRsvpMessage },
        invites: { cachedInviteLink, rememberInviteLink },
        leagueChatId: leagueChatId(),
        now: new Date(),
      },
      update,
    );
  } catch (error) {
    console.error(
      `[telegram] handler failed for ${updateKind(update)} ${update.update_id}`,
      error,
    );
  }

  return NextResponse.json({ ok: true });
}

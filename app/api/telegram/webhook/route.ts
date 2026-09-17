import { NextResponse } from "next/server";
import { leagueChatId, optionalEnv, siteUrl } from "@/lib/env";
import { handleUpdate, updateKind } from "@/lib/bot/router";
import { miniAppUrl, resolveBotUsername } from "@/lib/bot/registration";
import { cachedBotUsername, rememberBotUsername } from "@/lib/repo/bot-identity";
import { liveServices } from "@/lib/bot/services";
import { liveReportDeps } from "@/lib/bot/report-services";
import { liveFantasyDeps } from "@/lib/bot/fantasy-services";
import { livePictureDeps } from "@/lib/bot/pictures";
import { nightPoll, toggleNightVote, votesForWeek } from "@/lib/repo/nights";
import { attachRsvpMessage, bookFixture } from "@/lib/repo/fixtures";
import { cachedInviteLink, rememberInviteLink } from "@/lib/repo/invite";
import { telegramClient } from "@/lib/telegram/factory";
import type { TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
// Webhook deliveries must never be served from a cache.
export const dynamic = "force-dynamic";

/**
 * The bot's own username, held for the life of the serverless instance.
 *
 * It cannot change without a redeploy, and every update that greets somebody needs
 * it, so reading it from the database on each one would be a query to learn a
 * constant. `undefined` means "not looked up yet"; a resolved `undefined` is cached
 * as such, so a bot with no username does not re-ask Telegram on every message.
 */
let username: { value: string | undefined } | undefined;

async function botUsername(
  client: ReturnType<typeof telegramClient>,
): Promise<string | undefined> {
  username ??= {
    value: await resolveBotUsername(
      client,
      { cached: cachedBotUsername, remember: rememberBotUsername },
      optionalEnv("TELEGRAM_BOT_USERNAME"),
    ),
  };
  return username.value;
}

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

  const client = telegramClient();

  try {
    await handleUpdate(
      {
        client,
        services: liveServices(),
        reports: liveReportDeps(),
        fantasy: liveFantasyDeps(),
        pictures: livePictureDeps(),
        nights: { toggleNightVote, votesForWeek, nightPoll },
        fixtures: { bookFixture, attachRsvpMessage },
        invites: { cachedInviteLink, rememberInviteLink },
        leagueChatId: leagueChatId(),
        // Both were missing here for the whole life of the deployment, and both are
        // optional on the context — so the welcome rendered without its "say hello"
        // deep link and without its Mini App button, and nothing anywhere said so.
        // A newcomer was told to start a private chat and given nothing to tap.
        botUsername: await botUsername(client),
        miniAppUrl: miniAppUrl(siteUrl()),
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

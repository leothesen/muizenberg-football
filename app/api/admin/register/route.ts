import { NextResponse } from "next/server";
import {
  ALLOWED_UPDATES,
  miniAppUrl,
  resolveBotUsername,
  syncCommands,
  webhookUrl,
} from "@/lib/bot/registration";
import { cachedBotUsername, rememberBotUsername } from "@/lib/repo/bot-identity";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { optionalEnv, requireEnv, siteUrl } from "@/lib/env";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells Telegram what this bot is.
 *
 * Run once after deploying, and again whenever the command list or the site URL
 * changes. It is idempotent — every call is a "set", not an "add" — so running it
 * twice costs nothing and running it after a change is the fix.
 *
 * Authorised with the same secret as the crons rather than being open: pointing a
 * bot's webhook somewhere is not something a stranger should be able to do.
 */
export async function POST(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const site = siteUrl();
  const client = telegramClient();
  const done: string[] = [];

  // Shared with the daily keepalive, which re-runs it so the menu cannot drift away
  // from the code between deployments.
  await syncCommands(client);
  done.push("commands");

  // Ask Telegram what this bot is called and write it down, so the welcome can build
  // a deep link into a private chat without anybody having configured one. Every
  // route that wants to say "tap here to talk to me" reads it from here afterwards.
  const username = await resolveBotUsername(
    client,
    { cached: cachedBotUsername, remember: rememberBotUsername },
    optionalEnv("TELEGRAM_BOT_USERNAME"),
  );
  if (username) {
    await rememberBotUsername(username);
    done.push("username");
  }

  // The menu button is the Mini App's front door — the little button beside the
  // message box that opens the league without anybody typing a command.
  //
  // Set once, with no chat id, which is the default for every private chat. There
  // used to be a second call scoping it to the league group, and it could never have
  // worked: a group has no menu button, and Telegram answers a group id here with
  // "Bad Request: invalid chat_id specified" — which reads like the chat id is wrong.
  // It was not. It took down the first real registration, and everything after this
  // point, including the webhook, never ran.
  await client.setChatMenuButton({
    type: "web_app",
    text: "League",
    web_app: { url: miniAppUrl(site) },
  });
  done.push("menu-button");

  // Only with a real token: pointing Telegram at a URL is meaningless in the
  // emulator, and setting a webhook to localhost would just fail.
  if (optionalEnv("TELEGRAM_BOT_TOKEN")) {
    await client.setWebhook({
      url: webhookUrl(site),
      secret_token: requireEnv("TELEGRAM_WEBHOOK_SECRET"),
      allowed_updates: [...ALLOWED_UPDATES],
      drop_pending_updates: false,
    });
    done.push("webhook");
  }

  return NextResponse.json({
    ok: true,
    site,
    miniApp: miniAppUrl(site),
    botUsername: username ?? null,
    done,
  });
}

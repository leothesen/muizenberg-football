import { NextResponse } from "next/server";
import {
  ALLOWED_UPDATES,
  GROUP_COMMANDS,
  PRIVATE_COMMANDS,
  miniAppUrl,
  webhookUrl,
} from "@/lib/bot/registration";
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

  await client.setMyCommands(GROUP_COMMANDS, { type: "all_group_chats" });
  done.push("commands:group");

  await client.setMyCommands(PRIVATE_COMMANDS, { type: "all_private_chats" });
  done.push("commands:private");

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

  return NextResponse.json({ ok: true, site, miniApp: miniAppUrl(site), done });
}

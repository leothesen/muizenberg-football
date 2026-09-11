import { NextResponse } from "next/server";
import { handleUpdate } from "@/lib/bot/router";
import { liveServices } from "@/lib/bot/services";
import { liveReportDeps } from "@/lib/bot/report-services";
import { liveFantasyDeps } from "@/lib/bot/fantasy-services";
import { livePictureDeps } from "@/lib/bot/pictures";
import { devToolsEnabled } from "@/lib/dev-guard";
import { findPlayerByTelegramId, setEmoji } from "@/lib/repo/players";
import { db } from "@/lib/db";
import { telegramEmulatorMessages } from "@/lib/db/schema";
import { telegramClient } from "@/lib/telegram/factory";
import type { TelegramUpdate, TelegramUser } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feeds a synthetic update into the real router.
 *
 * Deliberately not a mock of the bot: it builds the same TelegramUpdate shape
 * Telegram would send and hands it to the same `handleUpdate`, so what the emulator
 * shows is the actual behaviour rather than a parallel implementation of it.
 */
interface SimulateBody {
  action: "join" | "leave" | "message" | "callback" | "inline";
  telegramUserId: number;
  firstName?: string;
  username?: string;
  chatId: number;
  text?: string;
  callbackData?: string;
  /** Emulator only: the emoji the new player should appear as. */
  emoji?: string;
  /** The message the tapped button belongs to. */
  messageId?: number;
}

export async function POST(request: Request): Promise<Response> {
  if (!devToolsEnabled()) {
    return NextResponse.json(
      { ok: false, error: "not available" },
      { status: 404 },
    );
  }

  const body = (await request.json()) as SimulateBody;
  const user: TelegramUser = {
    id: body.telegramUserId,
    is_bot: false,
    first_name: body.firstName ?? "Player",
    username: body.username,
  };

  const update = buildUpdate(body, user);
  if (!update) {
    return NextResponse.json(
      { ok: false, error: "unknown action" },
      { status: 400 },
    );
  }

  try {
    await handleUpdate(
      {
        client: telegramClient(),
        services: liveServices(),
        reports: liveReportDeps(),
        fantasy: liveFantasyDeps(),
        pictures: livePictureDeps(),
        now: new Date(),
        botUsername: "MuizenbergFootballBot",
      },
      update,
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  // Telegram has no concept of the emoji a player is shown as — it is ours, assigned
  // a default on enrolment. Applying it after the join rather than threading it
  // through the update keeps the fake update a faithful Telegram shape.
  if (body.action === "join" && body.emoji) {
    const player = await findPlayerByTelegramId(body.telegramUserId);
    if (player) await setEmoji(player.id, body.emoji);
  }

  return NextResponse.json({ ok: true });
}

function buildUpdate(
  body: SimulateBody,
  user: TelegramUser,
): TelegramUpdate | null {
  // Real update ids are monotonic per bot; any unique number works here, and
  // uniqueness is what stops the de-duplication table rejecting a repeat click.
  const update_id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const chat = {
    id: body.chatId,
    type: body.chatId < 0 ? ("supergroup" as const) : ("private" as const),
  };

  switch (body.action) {
    case "join":
      return {
        update_id,
        chat_member: {
          chat,
          from: user,
          date: Math.floor(Date.now() / 1000),
          old_chat_member: { status: "left", user },
          new_chat_member: { status: "member", user },
        },
      };

    case "leave":
      return {
        update_id,
        chat_member: {
          chat,
          from: user,
          date: Math.floor(Date.now() / 1000),
          old_chat_member: { status: "member", user },
          new_chat_member: { status: "left", user },
        },
      };

    case "message":
      return {
        update_id,
        message: {
          message_id: update_id % 100000,
          from: user,
          chat,
          date: Math.floor(Date.now() / 1000),
          text: body.text ?? "",
        },
      };

    case "inline":
      // Inline queries arrive from chats the bot is not in, so there is no chat id
      // on them at all — only the type of chat they came from.
      return {
        update_id,
        inline_query: {
          id: `sim-inline-${update_id}`,
          from: user,
          query: body.text ?? "",
          offset: "",
          chat_type: body.chatId < 0 ? "group" : "sender",
        },
      };

    case "callback":
      return {
        update_id,
        callback_query: {
          id: `sim-${update_id}`,
          from: user,
          chat_instance: String(body.chatId),
          data: body.callbackData ?? "",
          // Telegram always attaches the message a button belongs to, and handlers
          // need it to know which message to rewrite. Omitting it made every
          // in-place edit silently do nothing.
          message: {
            message_id: body.messageId ?? 0,
            chat,
            date: Math.floor(Date.now() / 1000),
          },
        },
      };

    default:
      return null;
  }
}

/** Wipes the emulator chat so a demo can start from nothing. */
export async function DELETE(): Promise<Response> {
  if (!devToolsEnabled()) {
    return NextResponse.json(
      { ok: false, error: "not available" },
      { status: 404 },
    );
  }

  // No predicate: clearing the emulator outbox means all of it. PostgREST refused a
  // delete without a filter, which is why this used to carry a meaningless id >= 0.
  await db().delete(telegramEmulatorMessages);

  return NextResponse.json({ ok: true });
}

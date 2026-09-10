import { NextResponse } from "next/server";
import { miniAppBotToken, usingDevBotToken } from "@/lib/auth/bot-token";
import { signInitData } from "@/lib/auth/mini-app";
import { devToolsEnabled } from "@/lib/dev-guard";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints the `initData` Telegram would hand a Mini App, for a seeded player.
 *
 * This is what makes the Mini App login testable without a phone: the payload is
 * signed with the local stand-in token and then verified by the real verifier, so the
 * path under test is the production one and only the key differs.
 *
 * Refuses outright once a real bot token exists — signing arbitrary identities with
 * the live token would be exactly the forgery the verifier is there to prevent.
 */
export async function GET(request: Request): Promise<Response> {
  if (!devToolsEnabled() || !usingDevBotToken()) {
    return NextResponse.json(
      { ok: false, error: "not available" },
      { status: 404 },
    );
  }

  const botToken = miniAppBotToken();
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "no token" }, { status: 503 });
  }

  const wanted = new URL(request.url).searchParams.get("telegramUserId");

  const columns = {
    telegram_user_id: players.telegram_user_id,
    first_name: players.first_name,
    telegram_username: players.telegram_username,
  };

  const rows = wanted
    ? await db()
        .select(columns)
        .from(players)
        .where(eq(players.telegram_user_id, Number(wanted)))
        .limit(1)
    : await db()
        .select(columns)
        .from(players)
        .orderBy(asc(players.telegram_user_id))
        .limit(1);

  const player = rows[0];
  if (!player) {
    return NextResponse.json(
      { ok: false, error: "no such player" },
      { status: 404 },
    );
  }

  const params = new URLSearchParams({
    user: JSON.stringify({
      id: player.telegram_user_id,
      first_name: player.first_name,
      username: player.telegram_username ?? undefined,
    }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    chat_type: "supergroup",
    chat_instance: "-1234567890123456789",
  });

  params.set("hash", signInitData(params, botToken));

  return NextResponse.json({ ok: true, initData: params.toString() });
}

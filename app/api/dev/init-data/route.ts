import { NextResponse } from "next/server";
import { miniAppBotToken, usingDevBotToken } from "@/lib/auth/bot-token";
import { signInitData } from "@/lib/auth/mini-app";
import { devToolsEnabled } from "@/lib/dev-guard";
import { db } from "@/lib/supabase";

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
    return NextResponse.json({ ok: false, error: "not available" }, { status: 404 });
  }

  const botToken = miniAppBotToken();
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "no token" }, { status: 503 });
  }

  const wanted = new URL(request.url).searchParams.get("telegramUserId");

  const query = db().from("players").select("telegram_user_id, first_name, telegram_username");
  const { data, error } = wanted
    ? await query.eq("telegram_user_id", Number(wanted)).limit(1)
    : await query.order("telegram_user_id").limit(1);

  if (error) throw error;

  const player = data?.[0];
  if (!player) {
    return NextResponse.json({ ok: false, error: "no such player" }, { status: 404 });
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

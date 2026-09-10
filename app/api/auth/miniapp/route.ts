import { NextResponse } from "next/server";
import { verifyInitData } from "@/lib/auth/mini-app";
import { startSession } from "@/lib/auth/current-user";
import { miniAppBotToken } from "@/lib/auth/bot-token";
import { ensurePlayer } from "@/lib/repo/players";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Mini App's front door.
 *
 * The page hands over the `initData` Telegram gave it; if the signature checks out,
 * the Telegram user in it is who they say they are and they get a session. There is
 * no other way in from the app, and no password anywhere in the product.
 *
 * Opening the Mini App is also enrolment: somebody who found the bot without ever
 * being in the group still becomes a player, exactly as joining the chat would.
 */
export async function POST(request: Request): Promise<Response> {
  // Real token in production, a documented stand-in locally — but always a real
  // signature check. Accepting unsigned initData "just for development" would be a
  // backdoor in production the first time an environment variable went missing.
  const botToken = miniAppBotToken();

  if (!botToken) {
    return NextResponse.json(
      { ok: false, error: "no bot token configured" },
      { status: 503 },
    );
  }

  let initData: string | undefined;
  try {
    const body = (await request.json()) as { initData?: unknown };
    initData = typeof body.initData === "string" ? body.initData : undefined;
  } catch {
    initData = undefined;
  }

  if (!initData) {
    return NextResponse.json({ ok: false, error: "no initData" }, { status: 400 });
  }

  const verified = verifyInitData(initData, botToken);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.reason }, { status: 401 });
  }

  const { player } = await ensurePlayer({
    id: verified.user.id,
    is_bot: false,
    first_name: verified.user.first_name,
    last_name: verified.user.last_name,
    username: verified.user.username,
  });

  await startSession({ playerId: player.id, telegramUserId: verified.user.id });

  return NextResponse.json({
    ok: true,
    player: {
      id: player.id,
      displayName: player.display_name,
      emoji: player.emoji,
      rating: Number(player.rating),
    },
  });
}

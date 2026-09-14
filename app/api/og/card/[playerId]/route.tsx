import { NextResponse } from "next/server";
import { imageResponse } from "@/lib/og/render";
import { playerCardOrBlankScene } from "@/lib/og/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One player's card as a PNG.
 *
 * Keyed on the internal player id rather than the Telegram user id, so a card URL
 * never leaks a Telegram identifier — the same rule the public views follow.
 *
 * Somebody who has not played yet gets their blank card, exactly as the bot sends it.
 * This used to answer 404 for them — "no card for that player yet" — and every player
 * page puts this image at the top, so each new member's page opened on a broken image.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
): Promise<Response> {
  const { playerId } = await params;
  const scene = await playerCardOrBlankScene(playerId);

  if (!scene) {
    return NextResponse.json({ error: "no such player" }, { status: 404 });
  }

  return imageResponse(scene.element, scene.size);
}

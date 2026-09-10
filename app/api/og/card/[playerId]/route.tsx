import { NextResponse } from "next/server";
import { imageResponse } from "@/lib/og/render";
import { playerCardScene } from "@/lib/og/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One player's card as a PNG.
 *
 * Keyed on the internal player id rather than the Telegram user id, so a card URL
 * never leaks a Telegram identifier — the same rule the public views follow.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
): Promise<Response> {
  const { playerId } = await params;
  const scene = await playerCardScene(playerId);

  if (!scene) {
    return NextResponse.json({ error: "no card for that player yet" }, { status: 404 });
  }

  return imageResponse(scene.element, scene.size);
}

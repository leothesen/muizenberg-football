import { imageResponse } from "@/lib/og/render";
import { leaderboardScene } from "@/lib/og/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The season table as a PNG.
 *
 * Public: it shows display names and numbers, which is exactly what the group already
 * sees in the chat, and no Telegram identifiers. The bot renders the same element in
 * process rather than fetching this route, so this exists for the web app, for link
 * previews, and for looking at while building.
 */
export async function GET(): Promise<Response> {
  const scene = await leaderboardScene();
  return imageResponse(scene.element, scene.size);
}

import { imageResponse } from "@/lib/og/render";
import { welcomeScene } from "@/lib/og/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How the week works, as a PNG.
 *
 * The bot renders the same element in process and uploads the bytes, so this route is
 * not what a newcomer receives. It exists to be looked at while changing the picture,
 * which otherwise means joining a group to see it, and for link previews.
 */
export async function GET(): Promise<Response> {
  const scene = welcomeScene();
  return imageResponse(scene.element, scene.size);
}

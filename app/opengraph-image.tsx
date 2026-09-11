import { imageResponse } from "@/lib/og/render";
import { SocialImage, socialImageSize } from "@/lib/og/social-image";
import { currentSeason } from "@/lib/public/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "The league — squads, goals, nutmegs and bragging rights";
export const size = socialImageSize();
export const contentType = "image/png";

/**
 * The preview image for the whole site.
 *
 * Next wires this into the page metadata by itself, so pasting the link anywhere —
 * WhatsApp, Telegram, Slack — gets the beach rather than a blank square. That matters
 * more than it sounds: a link in WhatsApp is the entire plan for moving the group.
 *
 * The season name is read live rather than baked in, so the preview says which season
 * is running without anybody remembering to regenerate a picture.
 */
export default async function Image(): Promise<Response> {
  // The season name is the one thing here that needs a database, and it is the least
  // important thing on the picture. A link posted into WhatsApp should not lose its
  // preview because a query was slow — the eyebrow just goes away.
  const season = await currentSeason().catch(() => null);
  return imageResponse(<SocialImage seasonName={season?.name ?? ""} />, size);
}

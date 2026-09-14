import { imageResponse } from "@/lib/og/render";
import { playerCardOrBlankScene } from "@/lib/og/scenes";
import { SocialImage, socialImageSize } from "@/lib/og/social-image";
import { currentSeason, playerById } from "@/lib/public/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "A player's card";
export const contentType = "image/png";

/**
 * Sharing somebody's page shows their card.
 *
 * The entire incentive in this app is the card: it is what people screenshot and what
 * the fantasy league exists to produce. So a link to a player is the card itself
 * rather than a generic banner with their name on it.
 *
 * Deliberately the card's own portrait shape rather than the 1200x630 a link preview
 * usually wants. Telegram is where these links are actually pasted and it renders a
 * tall image properly; cropping the card to a letterbox to satisfy a convention would
 * cut off the thing being shared.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Response> {
  const { id } = await params;
  // A debutant gets their blank card, the same one their page and the bot show, rather
  // than a banner with their name on it — a link to a player is the card.
  const scene = await playerCardOrBlankScene(id).catch(() => null);

  // Only a bad id, or a database that is down, reaches here. It still needs a picture,
  // because a preview that fails renders as a broken link rather than as nothing.
  if (!scene) {
    const [player, season] = await Promise.all([
      playerById(id).catch(() => null),
      currentSeason().catch(() => null),
    ]);

    return imageResponse(
      <SocialImage seasonName={player ? player.displayName : (season?.name ?? "")} />,
      socialImageSize(),
    );
  }

  return imageResponse(scene.element, scene.size);
}

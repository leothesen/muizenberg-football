import { beforeEach, describe, expect, it } from "vitest";
import type { TelegramUser } from "@/lib/telegram/types";
import { resetToSeed } from "@/test/db/reset";
import { currentSeason } from "@/lib/repo/fixtures";
import { ensurePlayer } from "@/lib/repo/players";
import { careerTable } from "@/lib/repo/stats";
import { playerById } from "@/lib/public/queries";
import { PLAYER_CARD_SIZE } from "./player-card";
import { blankCardScene, playerCardOrBlankScene, playerCardScene } from "./scenes";

/**
 * Every player page on the website shows a card, so every player needs one.
 *
 * `playerCardScene` only builds a card from a career row, and a player has no career
 * row until they have played. The bot already fell back to the blank card for that
 * case; the website's card route did not, and answered 404 — which the player page
 * showed as a broken image. For a league that launches with nobody having played, that
 * was every card on the site.
 */

beforeEach(async () => {
  await resetToSeed();
});

/** Somebody who has joined the group and never played: exactly a first-week member. */
const debutant: TelegramUser = {
  id: 909090902,
  is_bot: false,
  first_name: "Tom",
  username: "tom_debut",
};

describe("a player's card", () => {
  it("has no real card for somebody who has never played", async () => {
    // The root cause, pinned: this null is what the card route turned into a 404.
    const { player } = await ensurePlayer(debutant);
    expect(await playerCardScene(player.id)).toBeNull();
  });

  it("gives somebody who has never played the blank card, as the bot does", async () => {
    const { player } = await ensurePlayer(debutant);

    const scene = await playerCardOrBlankScene(player.id);
    expect(scene, "a debutant got no card at all").not.toBeNull();
    expect(scene!.size).toEqual(PLAYER_CARD_SIZE);

    // Their own blank card — their name and emoji, this season — not a generic one.
    const [publicPlayer, season] = await Promise.all([playerById(player.id), currentSeason()]);
    const expected = blankCardScene(publicPlayer!, season?.name ?? "");
    expect(scene!.element.props).toEqual(expected.element.props);
  });

  it("still gives somebody who has played their real card", async () => {
    const [played] = await careerTable();
    expect(played, "the seed has nobody with games").toBeTruthy();

    const real = await playerCardScene(played!.playerId);
    const scene = await playerCardOrBlankScene(played!.playerId);
    expect(scene!.element.props).toEqual(real!.element.props);
  });

  it("has nothing for an id that is not a player", async () => {
    // Still a 404 on the website — a made-up id should not be drawn as somebody.
    expect(await playerCardOrBlankScene("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

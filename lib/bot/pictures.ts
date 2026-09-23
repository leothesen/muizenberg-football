import { createElement, type ReactElement } from "react";
import type { PickedTeams } from "@/domain/teams";
import { teamSheetProps } from "@/lib/og/props";
import { TeamSheetImage, teamSheetSize } from "@/lib/og/team-sheet-image";
import type { ImageSize } from "@/lib/og/layout";
import { renderPng } from "@/lib/og/render";
import { blankCardScene, leaderboardScene, playerCardScene, welcomeScene } from "@/lib/og/scenes";
import type { Illustration } from "./illustrate";

/**
 * The pictures the bot can draw, behind an interface.
 *
 * Same reason as every other dependency bundle here: `next/og` pulls in a WASM
 * renderer, so a router test that merely wanted to check which command was handled
 * would otherwise be rendering PNGs. Tests pass a stub; production passes this.
 */
export interface PictureDeps {
  render(element: ReactElement, size: ImageSize): Promise<Uint8Array>;
  /** Null when there is nothing worth drawing. */
  playerCard(player: {
    id: string;
    displayName: string;
    emoji: string;
    rating: number;
  }): Promise<Illustration | null>;
  leaderboard(): Promise<Illustration | null>;
  /**
   * How the week works. Synchronous and never null, unlike the others: it reads
   * nothing, so there is no query to fail and no "this player has no data" case.
   */
  welcome(): Illustration;
  /** The sheet as it stands, for redrawing it when somebody joins late. */
  teamSheet(params: { teams: PickedTeams; kickoffAt: Date; venue: string }): Illustration;
}

export function livePictureDeps(): PictureDeps {
  return {
    render: renderPng,
    async playerCard(player) {
      const scene = await playerCardScene(player.id);
      // Somebody who has never played still gets a card; a blank one is a nicer
      // welcome than "no data".
      return scene ?? blankCardScene(player, "");
    },
    async leaderboard() {
      return leaderboardScene();
    },
    welcome() {
      return welcomeScene();
    },
    teamSheet(params) {
      const props = teamSheetProps(params);
      return { element: createElement(TeamSheetImage, props), size: teamSheetSize(props) };
    },
  };
}

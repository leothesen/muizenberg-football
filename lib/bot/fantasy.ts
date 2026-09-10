import { formSummary, type SeasonStatRow } from "@/domain/leaderboards";
import { cardAttributes } from "@/domain/rating";
import type { CareerStatRow } from "@/domain/records";
import type { Outcome } from "@/domain/types";
import type { PlayerCardContext } from "./results";

/**
 * Assembling a player card.
 *
 * Kept apart from both the database and the message so the interesting part — which
 * numbers become which attributes — can be tested on its own. The card is built from
 * career totals rather than the season, because a card is a portrait rather than a
 * snapshot, and a new season would otherwise reset everyone to a blank.
 */

export interface FormEntryLike {
  outcome: Outcome | null;
  delta: number;
}

export interface CardInput {
  career: CareerStatRow;
  /** Newest first. */
  form: FormEntryLike[];
  badges: { emoji: string; name: string }[];
  /** How many badges to show before it stops being a card and starts being a list. */
  badgeLimit?: number;
}

const DEFAULT_BADGE_LIMIT = 8;

export function buildPlayerCard(input: CardInput): PlayerCardContext {
  const { career } = input;
  const appearances = career.appearances;

  const attributes = cardAttributes(
    {
      goals: perGame(career.goals, appearances),
      assists: perGame(career.assists, appearances),
      nutmegs: perGame(career.nutmegs, appearances),
      tackles: perGame(career.tackles, appearances),
      saves: perGame(career.saves, appearances),
      motmVotes: perGame(career.motmVotes, appearances),
    },
    appearances,
  );

  return {
    displayName: career.displayName,
    emoji: career.emoji,
    rating: career.rating,
    appearances,
    attributes,
    form: formSummary(input.form.map((f) => f.delta)),
    recentOutcomes: input.form.map((f) => f.outcome),
    goals: career.goals,
    assists: career.assists,
    nutmegs: career.nutmegs,
    tackles: career.tackles,
    saves: career.saves,
    motmVotes: career.motmVotes,
    badges: input.badges.slice(0, input.badgeLimit ?? DEFAULT_BADGE_LIMIT),
  };
}

function perGame(total: number, appearances: number): number {
  return appearances > 0 ? total / appearances : 0;
}

/**
 * A card for somebody who has never played. Everything sits at the neutral 55 rather
 * than at zero, because a debutant is unproven, not bad.
 */
export function blankCard(player: {
  displayName: string;
  emoji: string;
  rating: number;
}): PlayerCardContext {
  return buildPlayerCard({
    career: {
      playerId: "",
      displayName: player.displayName,
      emoji: player.emoji,
      appearances: 0,
      goals: 0,
      assists: 0,
      nutmegs: 0,
      tackles: 0,
      saves: 0,
      motmVotes: 0,
      rating: player.rating,
    },
    form: [],
    badges: [],
  });
}

/** The season row for one player, or null if they have not played this season. */
export function seasonRowFor(
  rows: SeasonStatRow[],
  playerId: string,
): SeasonStatRow | null {
  return rows.find((row) => row.playerId === playerId) ?? null;
}

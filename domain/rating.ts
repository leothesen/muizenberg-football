import type { MatchStatLine, Outcome } from "./types";

/**
 * The rating engine.
 *
 * Two constraints shaped this. First, the number has to move enough to be worth
 * checking on a Thursday morning, but not so much that one bad night undoes a
 * season — hence the hard cap on a single game's swing. Second, every change has to
 * be explainable in one sentence in a group chat, because an unexplained number
 * people cannot argue with is an unexplained number people stop caring about.
 *
 * Note that simply turning up is worth points. That is deliberate: attendance is the
 * thing the league actually needs, so the rating rewards it.
 */

export const RATING_FLOOR = 40;
export const RATING_CEILING = 99;
export const STARTING_RATING = 65;

/** Most a rating can move in a single night, up or down. */
export const MAX_SWING = 2.5;

const POINTS = {
  goal: 3,
  assist: 2,
  nutmeg: 2,
  tackle: 0.5,
  save: 0.4,
  ownGoal: -2,
  motmVote: 2,
  turnedUp: 0.5,
  win: 2,
  draw: 1,
  loss: 0,
} as const;

export interface RatingInput {
  rating: number;
  stats: MatchStatLine;
  /** Null when the final score was never agreed. */
  outcome: Outcome | null;
}

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
  /** Points earned on the night, before the expectation is subtracted. */
  performance: number;
  /** What a player of this rating was expected to produce. */
  expected: number;
  /** One sentence, ready to paste into Telegram. */
  reason: string;
}

export function clampRating(value: number): number {
  return Math.min(RATING_CEILING, Math.max(RATING_FLOOR, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function performancePoints(stats: MatchStatLine, outcome: Outcome | null): number {
  const fromPlay =
    stats.goals * POINTS.goal +
    stats.assists * POINTS.assist +
    stats.nutmegs * POINTS.nutmeg +
    stats.tackles * POINTS.tackle +
    stats.saves * POINTS.save +
    stats.ownGoals * POINTS.ownGoal +
    stats.motmVotes * POINTS.motmVote;

  const fromResult =
    outcome === "win" ? POINTS.win : outcome === "draw" ? POINTS.draw : POINTS.loss;

  return round2(fromPlay + fromResult + POINTS.turnedUp);
}

/**
 * What the league expects from someone already rated this highly. Better players
 * have to do more to keep climbing, which is what stops ratings running away.
 */
export function expectedPoints(rating: number): number {
  return round2(2.5 + (rating - STARTING_RATING) * 0.12);
}

export function rateMatch(input: RatingInput): RatingChange {
  const performance = performancePoints(input.stats, input.outcome);
  const expected = expectedPoints(input.rating);

  const raw = 0.35 * (performance - expected);
  const delta = round2(Math.min(MAX_SWING, Math.max(-MAX_SWING, raw)));
  const after = round2(clampRating(input.rating + delta));

  return {
    before: round2(input.rating),
    after,
    delta: round2(after - round2(input.rating)),
    performance,
    expected,
    reason: describeContribution(input.stats, input.outcome),
  };
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Turns a stat line into something worth reading. Only the things that actually
 * happened get a mention, and the list is capped so the sentence stays a sentence.
 */
export function describeContribution(stats: MatchStatLine, outcome: Outcome | null): string {
  const parts: string[] = [];

  if (stats.goals > 0) parts.push(plural(stats.goals, "goal"));
  if (stats.assists > 0) parts.push(plural(stats.assists, "assist"));
  if (stats.nutmegs > 0) parts.push(plural(stats.nutmegs, "nutmeg"));
  if (stats.tackles >= 5) parts.push(`${stats.tackles} tackles`);
  if (stats.saves >= 3) parts.push(`${stats.saves} saves`);
  if (stats.motmVotes > 0) parts.push(plural(stats.motmVotes, "vote"));
  if (stats.ownGoals > 0) parts.push(plural(stats.ownGoals, "own goal"));

  const result =
    outcome === "win" ? "a win" : outcome === "loss" ? "a loss" : outcome === "draw" ? "a draw" : null;

  if (parts.length === 0) {
    return result ? `Turned up, and ${result}.` : "Turned up.";
  }

  const trimmed = parts.slice(0, 3);
  if (result) trimmed.push(result);

  if (trimmed.length === 1) return `${capitalise(trimmed[0]!)}.`;
  const last = trimmed[trimmed.length - 1]!;
  return `${capitalise(trimmed.slice(0, -1).join(", "))} and ${last}.`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Card attributes, 40-99, derived only from things actually collected. Nothing here
 * is invented: if the league does not measure it, the card does not show it.
 *
 * Small sample sizes are regressed towards the middle so that one loud night does
 * not mint a 99-rated finisher.
 */
export interface PerGameAverages {
  goals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
  motmVotes: number;
}

export interface CardAttributes {
  finishing: number;
  vision: number;
  flair: number;
  defending: number;
  keeping: number;
  reputation: number;
}

/** Games before an average is trusted at face value. */
const CONFIDENCE_GAMES = 4;

function attribute(perGame: number, excellentAt: number, appearances: number): number {
  const confidence = appearances / (appearances + CONFIDENCE_GAMES);
  const ratio = Math.min(1, perGame / excellentAt);
  const scaled = 45 + ratio * 54;
  const regressed = 55 + (scaled - 55) * confidence;
  return Math.round(clampRating(regressed));
}

export function cardAttributes(avg: PerGameAverages, appearances: number): CardAttributes {
  if (appearances <= 0) {
    return { finishing: 55, vision: 55, flair: 55, defending: 55, keeping: 55, reputation: 55 };
  }
  return {
    finishing: attribute(avg.goals, 2, appearances),
    vision: attribute(avg.assists, 1.5, appearances),
    flair: attribute(avg.nutmegs, 1.5, appearances),
    defending: attribute(avg.tackles, 6, appearances),
    keeping: attribute(avg.saves, 8, appearances),
    reputation: attribute(avg.motmVotes, 2, appearances),
  };
}

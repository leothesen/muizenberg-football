import type { MatchStatLine, Outcome } from "./types";

/**
 * Deciding what somebody just earned.
 *
 * Badges are handed out generously and are meant to be read aloud in the group, so
 * the thresholds are low and the categories lean towards turning up and having a
 * laugh. Every code returned here must exist in the catalogue migration; a test
 * checks that the two cannot drift apart.
 */

export interface CareerTotals {
  appearances: number;
  goals: number;
  assists: number;
  nutmegs: number;
  motmAwards: number;
}

export interface BadgeContext {
  /** This game only. */
  match: MatchStatLine;
  outcome: Outcome | null;
  /** Goals the player's team conceded, if the score was settled. */
  goalsAgainst: number | null;
  /** What they said about their own performance, 1-10. */
  selfRating: number | null;
  /** Career totals *including* this game. */
  career: CareerTotals;
  /** Consecutive fixtures played, including this one. */
  streak: number;
  /** Won the most votes on the night. */
  wasMotm: boolean;
  /** First to say yes when the poll went out. */
  firstToRespond: boolean;
  /** Came off the waitlist to make the numbers up. */
  promotedFromWaitlist: boolean;
  /** Codes the player already holds; a badge is only ever earned once. */
  alreadyHeld: ReadonlySet<string>;
}

interface BadgeRule {
  code: string;
  earned: (ctx: BadgeContext) => boolean;
}

const RULES: BadgeRule[] = [
  // Turning up — deliberately the longest section.
  { code: "debut", earned: (c) => c.career.appearances === 1 },
  { code: "first_in", earned: (c) => c.firstToRespond },
  { code: "streak_5", earned: (c) => c.streak >= 5 },
  { code: "streak_10", earned: (c) => c.streak >= 10 },
  { code: "caps_25", earned: (c) => c.career.appearances >= 25 },
  { code: "caps_50", earned: (c) => c.career.appearances >= 50 },
  { code: "rescuer", earned: (c) => c.promotedFromWaitlist },

  // Scoring.
  { code: "first_goal", earned: (c) => c.career.goals >= 1 },
  { code: "hat_trick", earned: (c) => c.match.goals >= 3 },
  { code: "four_goals", earned: (c) => c.match.goals >= 4 },
  { code: "goals_10", earned: (c) => c.career.goals >= 10 },
  { code: "goals_50", earned: (c) => c.career.goals >= 50 },

  // Flair.
  { code: "first_nutmeg", earned: (c) => c.career.nutmegs >= 1 },
  { code: "nutmeg_3", earned: (c) => c.match.nutmegs >= 3 },
  { code: "nutmegs_25", earned: (c) => c.career.nutmegs >= 25 },

  // Making things happen.
  { code: "first_assist", earned: (c) => c.career.assists >= 1 },
  { code: "assists_3", earned: (c) => c.match.assists >= 3 },

  // The dirty work.
  { code: "tackles_10", earned: (c) => c.match.tackles >= 10 },
  { code: "clean_sheet", earned: (c) => c.goalsAgainst === 0 },
  { code: "saves_10", earned: (c) => c.match.saves >= 10 },

  // Character.
  { code: "motm", earned: (c) => c.wasMotm },
  { code: "motm_5", earned: (c) => c.career.motmAwards >= 5 },
  {
    code: "humble",
    earned: (c) => c.wasMotm && c.selfRating !== null && c.selfRating <= 5,
  },
  { code: "own_goal", earned: (c) => c.match.ownGoals >= 1 },
  {
    code: "full_house",
    earned: (c) => c.match.goals >= 1 && c.match.assists >= 1 && c.match.nutmegs >= 1,
  },
];

/** Every code this engine can ever emit. Used by the catalogue drift test. */
export const ALL_BADGE_CODES: readonly string[] = RULES.map((r) => r.code);

export function newBadges(ctx: BadgeContext): string[] {
  return RULES.filter((rule) => !ctx.alreadyHeld.has(rule.code) && rule.earned(ctx)).map(
    (rule) => rule.code,
  );
}

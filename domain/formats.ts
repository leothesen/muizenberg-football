import { minimumViable } from "./squad";
import type { SquadShape } from "./types";

/**
 * What to play with however many turned up.
 *
 * The league used to call the game off below a threshold, which is the one outcome
 * that makes next week worse: the people who did answer get nothing, and the lesson
 * they take is that answering the poll is a gamble. A Wednesday with five people is
 * not a failed eleven-a-side, it is a three-and-two, and somebody has to say so
 * before everybody makes other plans.
 *
 * So the number of players decides *what* is played and never *whether*. The only
 * floor is two, because one person cannot be split into two teams — and even then
 * there is something to do.
 */

export interface MatchFormat {
  /** Two sides can be made. False only below two players. */
  playable: boolean;
  /** "3 v 3", "Rondo", "Solo session". Short enough for a heading. */
  label: string;
  /** One line telling people what to actually do when they get there. */
  blurb: string;
  /** True when this is the league's normal game rather than a stand-in for it. */
  standard: boolean;
}

/** The fewest people who can still play something against each other. */
export const PLAYABLE_MINIMUM = 2;

/**
 * The small-sided ladder.
 *
 * Real formats people already know, not invented drills — the point is that nobody
 * has to be taught anything at six o'clock on a Wednesday. Odd numbers get the format
 * that handles an odd number honestly, which is why five is three-and-two with a
 * rotation rather than a vague "split as best you can".
 */
const LADDER: Record<number, { label: string; blurb: string }> = {
  0: {
    label: "Nobody yet",
    blurb: "Not a soul. The poll is still open if anyone fancies it.",
  },
  1: {
    label: "Solo session",
    blurb:
      "Wall passes, a bit of juggling, shooting practice. Nobody has to know.",
  },
  2: {
    label: "1 v 1",
    blurb: "First to five. Jumpers for goalposts.",
  },
  3: {
    label: "Rondo",
    blurb:
      "Two keep it, one wins it back. Whoever loses it goes in the middle.",
  },
  4: {
    label: "2 v 2",
    blurb: "Two touch, rolling goals, no keepers.",
  },
  5: {
    label: "3 v 2",
    blurb: "The two get a keeper. Whoever concedes rotates out.",
  },
  6: {
    label: "3 v 3",
    blurb: "Proper small-sided. Keeper rotates every goal.",
  },
  7: {
    label: "4 v 3",
    blurb: "The three get a keeper and first pick of ends.",
  },
};

/**
 * Whether an evening has stopped being a game.
 *
 * Deliberately narrow. A thin turnout is never a collapse — five people is a three
 * and a two, and the ladder above exists precisely so that nobody is ever told the
 * game is off for want of numbers. This is the other thing: teams were picked, and
 * then the people who were on them left. In practice that means weather, and the
 * honest description is not "cancelled" but "everybody went home".
 *
 * Only a locked fixture can collapse. Before teams are picked there is still a day
 * for people to come back, and cancelling then would teach the group that answering
 * early is a gamble.
 */
export function hasCollapsed(params: {
  status: string;
  confirmed: number;
}): boolean {
  return params.status === "locked" && params.confirmed < PLAYABLE_MINIMUM;
}

/** How a turnout divides, bigger side first. */
export function sidesFor(confirmed: number): { a: number; b: number } {
  return { a: Math.ceil(confirmed / 2), b: Math.floor(confirmed / 2) };
}

export function formatFor(confirmed: number, shape: SquadShape): MatchFormat {
  const playable = confirmed >= PLAYABLE_MINIMUM;

  // At or above the league's own minimum this is simply the game, and saying
  // anything clever about it would be noise on a normal week.
  if (confirmed >= minimumViable(shape)) {
    const { a, b } = sidesFor(confirmed);
    return {
      playable,
      label: `${a} v ${b}`,
      blurb: "",
      standard: true,
    };
  }

  const rung = LADDER[confirmed];
  if (rung) return { ...rung, playable, standard: false };

  // Between the top of the ladder and the league minimum — possible if the shape is
  // ever configured larger. Still a real game, just a smaller one.
  const { a, b } = sidesFor(confirmed);
  return {
    playable,
    label: `${a} v ${b}`,
    blurb: "Small sides, rolling keeper.",
    standard: false,
  };
}

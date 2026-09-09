import type { Commitment, SquadShape } from "./types";

/**
 * Squad selection and the waitlist.
 *
 * The rule the group actually needs to trust is "who is playing tomorrow", so it is
 * defined once, here, as a pure function of who said yes and when. Nothing is stored,
 * which means the answer can never drift out of sync with the RSVPs.
 */

export function capacityOf(shape: SquadShape): number {
  return (shape.playersPerTeam + shape.subsPerTeam) * 2;
}

/** The minimum bodies that make a game worth turning up for. */
export function minimumViable(shape: SquadShape): number {
  return Math.max(6, shape.playersPerTeam);
}

export interface SquadSplit {
  /** In, in commitment order, capped at capacity. */
  playing: Commitment[];
  /** In, but past the cap. First on this list is first promoted. */
  waitlisted: Commitment[];
}

/**
 * Order is "first to commit, first onto the pitch". Someone who drops out and
 * rejoins goes to the back of the queue, which is the reading everybody accepts
 * without arguing about it.
 */
export function splitSquad(commitments: Commitment[], shape: SquadShape): SquadSplit {
  const capacity = capacityOf(shape);
  const ordered = [...commitments].sort(compareCommitments);
  return {
    playing: ordered.slice(0, capacity),
    waitlisted: ordered.slice(capacity),
  };
}

function compareCommitments(a: Commitment, b: Commitment): number {
  const byTime = a.inSince.getTime() - b.inSince.getTime();
  if (byTime !== 0) return byTime;
  // Identical timestamps are possible in tests and in a seeded database; falling back
  // to the id keeps the ordering stable rather than dependent on input order.
  return a.player.id.localeCompare(b.player.id);
}

export interface SquadHealth {
  confirmed: number;
  capacity: number;
  spotsLeft: number;
  waitlistLength: number;
  /** Enough people to actually play. */
  viable: boolean;
  /** How many more are needed before the game is on. */
  shortBy: number;
  full: boolean;
}

export function squadHealth(commitments: Commitment[], shape: SquadShape): SquadHealth {
  const { playing, waitlisted } = splitSquad(commitments, shape);
  const capacity = capacityOf(shape);
  const minimum = minimumViable(shape);
  return {
    confirmed: playing.length,
    capacity,
    spotsLeft: Math.max(0, capacity - playing.length),
    waitlistLength: waitlisted.length,
    viable: playing.length >= minimum,
    shortBy: Math.max(0, minimum - playing.length),
    full: playing.length >= capacity,
  };
}

/**
 * Who moves up when someone drops out. Returns the players who are newly on the
 * pitch, so the bot can tell exactly those people and nobody else.
 */
export function promotionsAfterDropout(
  before: Commitment[],
  after: Commitment[],
  shape: SquadShape,
): Commitment[] {
  const wasPlaying = new Set(splitSquad(before, shape).playing.map((c) => c.player.id));
  return splitSquad(after, shape).playing.filter((c) => !wasPlaying.has(c.player.id));
}

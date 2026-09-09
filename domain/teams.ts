import { splitSquad } from "./squad";
import type { Commitment, PlayerLike, Side, SquadShape } from "./types";

/**
 * Picking the sides.
 *
 * Two competing fairness rules meet here, and they are resolved in this order:
 *
 *  1. The two teams should be about as good as each other, because a 9-1 drubbing is
 *     nobody's idea of a good Wednesday.
 *  2. Whoever committed first should start, because rewarding the people who answer
 *     the poll early is the whole attendance flywheel. Subs are the last to commit,
 *     never the worst players.
 *
 * The result is deterministic: the same inputs always produce the same teams, so the
 * bot can be re-run without reshuffling everybody.
 */

export interface TeamSheet {
  side: Side;
  name: string;
  colour: string;
  starters: PlayerLike[];
  subs: PlayerLike[];
}

export interface PickedTeams {
  a: TeamSheet;
  b: TeamSheet;
  /** Combined rating difference between the sides. Lower is better. */
  ratingGap: number;
}

const TEAM_IDENTITIES: Record<Side, { name: string; colour: string }> = {
  a: { name: "Bibs", colour: "hut-yellow" },
  b: { name: "Skins", colour: "hut-blue" },
};

function totalRating(players: PlayerLike[]): number {
  return players.reduce((sum, p) => sum + p.rating, 0);
}

/**
 * Split into two sides of near-equal strength. Exported for testing the balancing
 * on its own; callers normally want `pickTeams`.
 */
export function balanceTeams(players: PlayerLike[]): { a: PlayerLike[]; b: PlayerLike[] } {
  const targetA = Math.ceil(players.length / 2);

  const keepers = players.filter((p) => p.preferredPosition === "gk");
  const outfield = players.filter((p) => p.preferredPosition !== "gk");

  const a: PlayerLike[] = [];
  const b: PlayerLike[] = [];

  // A keeper each, where the group has two. Nobody enjoys playing the side that has
  // to put an outfield player in goal.
  const sortedKeepers = [...keepers].sort(byRatingThenId);
  sortedKeepers.forEach((keeper, i) => {
    (i % 2 === 0 ? a : b).push(keeper);
  });

  // Strongest first into whichever side is currently weaker and still has room.
  for (const player of [...outfield].sort(byRatingThenId)) {
    const aHasRoom = a.length < targetA;
    const bHasRoom = b.length < players.length - targetA;
    if (aHasRoom && !bHasRoom) a.push(player);
    else if (bHasRoom && !aHasRoom) b.push(player);
    else if (totalRating(a) <= totalRating(b)) a.push(player);
    else b.push(player);
  }

  return refineBySwapping(a, b);
}

/**
 * Greedy assignment gets close; swapping one player for another closes most of the
 * remaining gap. Keepers are held in place so a swap cannot leave a side without one.
 */
function refineBySwapping(
  a: PlayerLike[],
  b: PlayerLike[],
): { a: PlayerLike[]; b: PlayerLike[] } {
  const teamA = [...a];
  const teamB = [...b];
  const swappable = (p: PlayerLike) => p.preferredPosition !== "gk";

  // Bounded: each pass must strictly improve the gap, and the gap is a positive
  // number that only decreases, so this cannot spin.
  for (let pass = 0; pass < 50; pass++) {
    const gap = totalRating(teamA) - totalRating(teamB);
    let best: { i: number; j: number; gap: number } | null = null;

    for (let i = 0; i < teamA.length; i++) {
      const pa = teamA[i];
      if (!pa || !swappable(pa)) continue;
      for (let j = 0; j < teamB.length; j++) {
        const pb = teamB[j];
        if (!pb || !swappable(pb)) continue;
        const newGap = Math.abs(gap - 2 * (pa.rating - pb.rating));
        if (newGap < Math.abs(gap) - 1e-9 && (best === null || newGap < best.gap)) {
          best = { i, j, gap: newGap };
        }
      }
    }

    if (!best) break;
    const pa = teamA[best.i]!;
    const pb = teamB[best.j]!;
    teamA[best.i] = pb;
    teamB[best.j] = pa;
  }

  return { a: teamA, b: teamB };
}

function byRatingThenId(x: PlayerLike, y: PlayerLike): number {
  if (y.rating !== x.rating) return y.rating - x.rating;
  return x.id.localeCompare(y.id);
}

/**
 * The whole job: take who said yes, return two team sheets with subs marked.
 */
export function pickTeams(commitments: Commitment[], shape: SquadShape): PickedTeams {
  const { playing } = splitSquad(commitments, shape);

  // Commitment order, so "who starts" can be answered by when they replied.
  const order = new Map(playing.map((c, i) => [c.player.id, i]));
  const { a, b } = balanceTeams(playing.map((c) => c.player));

  return {
    a: toTeamSheet("a", a, order, shape),
    b: toTeamSheet("b", b, order, shape),
    ratingGap: Math.abs(totalRating(a) - totalRating(b)),
  };
}

function toTeamSheet(
  side: Side,
  players: PlayerLike[],
  order: Map<string, number>,
  shape: SquadShape,
): TeamSheet {
  const byCommitment = [...players].sort(
    (x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0),
  );

  // Only bench people once the side is bigger than a full eleven-a-side would be;
  // a thin turnout means everybody starts.
  const starterCount = Math.max(
    byCommitment.length - shape.subsPerTeam,
    Math.min(byCommitment.length, shape.playersPerTeam),
  );

  const identity = TEAM_IDENTITIES[side];
  return {
    side,
    name: identity.name,
    colour: identity.colour,
    starters: byCommitment.slice(0, starterCount),
    subs: byCommitment.slice(starterCount),
  };
}

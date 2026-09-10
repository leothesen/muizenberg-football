import { splitSquad } from "./squad";
import type { Commitment, PlayerLike, Side, SquadShape } from "./types";

/**
 * Picking the sides.
 *
 * There are no positions in this league — everybody plays everywhere and the keeper
 * rotates during the game — so balancing is purely a matter of making the two sides
 * about as strong as each other.
 *
 * The one rule that is not about strength: whoever committed first starts. Rewarding
 * the people who answer the poll early is the whole attendance flywheel, so subs are
 * the last to reply, never the weakest players.
 *
 * Deterministic: the same inputs always produce the same teams, so the bot can be
 * re-run without reshuffling everybody.
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
  /**
   * Difference in *average* rating between the sides, per player. Averages rather
   * than totals: with an odd turnout one side has an extra body, so comparing totals
   * would report a large gap for two perfectly matched teams.
   */
  ratingGap: number;
}

const TEAM_IDENTITIES: Record<Side, { name: string; colour: string }> = {
  a: { name: "Bibs", colour: "hut-yellow" },
  b: { name: "Skins", colour: "hut-blue" },
};

function totalRating(players: PlayerLike[]): number {
  return players.reduce((sum, p) => sum + p.rating, 0);
}

/** An empty side counts as average, so the first pick is not forced by a zero. */
function averageRating(players: PlayerLike[]): number {
  if (players.length === 0) return 0;
  return totalRating(players) / players.length;
}

/**
 * Split into two sides of near-equal strength. Exported for testing the balancing on
 * its own; callers normally want `pickTeams`.
 */
export function balanceTeams(players: PlayerLike[]): { a: PlayerLike[]; b: PlayerLike[] } {
  const targetA = Math.ceil(players.length / 2);
  const a: PlayerLike[] = [];
  const b: PlayerLike[] = [];

  // Strongest first into whichever side is currently weaker and still has room.
  for (const player of [...players].sort(byRatingThenId)) {
    const aHasRoom = a.length < targetA;
    const bHasRoom = b.length < players.length - targetA;
    if (aHasRoom && !bHasRoom) a.push(player);
    else if (bHasRoom && !aHasRoom) b.push(player);
    else if (averageRating(a) <= averageRating(b)) a.push(player);
    else b.push(player);
  }

  return refineBySwapping(a, b);
}

/**
 * Greedy assignment gets close; swapping one player for another closes most of the
 * remaining gap.
 */
function refineBySwapping(
  a: PlayerLike[],
  b: PlayerLike[],
): { a: PlayerLike[]; b: PlayerLike[] } {
  const teamA = [...a];
  const teamB = [...b];

  // Bounded: each pass must strictly reduce the gap, and the gap is a positive
  // number that only decreases, so this cannot spin.
  for (let pass = 0; pass < 50; pass++) {
    const gap = Math.abs(averageRating(teamA) - averageRating(teamB));
    let best: { i: number; j: number; gap: number } | null = null;

    for (let i = 0; i < teamA.length; i++) {
      const pa = teamA[i];
      if (!pa) continue;
      for (let j = 0; j < teamB.length; j++) {
        const pb = teamB[j];
        if (!pb) continue;
        // Swapping preserves both team sizes, so the new averages follow directly
        // from moving one rating each way.
        const newGap = Math.abs(
          (totalRating(teamA) - pa.rating + pb.rating) / teamA.length -
            (totalRating(teamB) - pb.rating + pa.rating) / teamB.length,
        );
        if (newGap < gap - 1e-9 && (best === null || newGap < best.gap)) {
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

/** The whole job: take who said yes, return two team sheets with subs marked. */
export function pickTeams(commitments: Commitment[], shape: SquadShape): PickedTeams {
  const { playing } = splitSquad(commitments, shape);

  // Commitment order, so "who starts" can be answered by when they replied.
  const order = new Map(playing.map((c, i) => [c.player.id, i]));
  const { a, b } = balanceTeams(playing.map((c) => c.player));

  return {
    a: toTeamSheet("a", a, order, shape),
    b: toTeamSheet("b", b, order, shape),
    ratingGap: Math.abs(averageRating(a) - averageRating(b)),
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

  // Only bench people once the side is bigger than a full team; a thin turnout means
  // everybody starts.
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

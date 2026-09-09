import type { Side } from "./types";

/**
 * Agreeing on the final score.
 *
 * Nobody keeps score properly in a Wednesday kickabout, so each player is asked what
 * they think it finished from their own point of view ("we won 6-4"), which is the
 * only version a human can actually answer. Those answers then have to be reconciled
 * into one result, and they will not all agree.
 *
 * The rule is: whichever scoreline the most people reported wins. Ties are broken by
 * picking the scoreline closest to everything that was reported, so a genuine split
 * lands in the middle rather than on whoever happened to answer first.
 */

export interface ScoreReport {
  playerId: string;
  /** Which team this player was on. */
  side: Side;
  goalsFor: number;
  goalsAgainst: number;
}

export interface Scoreline {
  a: number;
  b: number;
}

export interface ScoreConsensus {
  score: Scoreline | null;
  /** How many reports backed the winning scoreline. */
  agreed: number;
  /** How many usable reports there were in total. */
  total: number;
  /** True when everybody who answered said the same thing. */
  unanimous: boolean;
  /** True when the result was settled by the tie-break rather than outright. */
  contested: boolean;
}

/** Puts a report into absolute terms rather than the reporter's terms. */
export function normalise(report: ScoreReport): Scoreline {
  return report.side === "a"
    ? { a: report.goalsFor, b: report.goalsAgainst }
    : { a: report.goalsAgainst, b: report.goalsFor };
}

const key = (s: Scoreline) => `${s.a}-${s.b}`;

export function agreeScore(reports: ScoreReport[]): ScoreConsensus {
  const usable = reports.filter(
    (r) => Number.isInteger(r.goalsFor) && Number.isInteger(r.goalsAgainst),
  );

  if (usable.length === 0) {
    return { score: null, agreed: 0, total: 0, unanimous: false, contested: false };
  }

  const normalised = usable.map(normalise);

  const tally = new Map<string, { score: Scoreline; count: number }>();
  for (const score of normalised) {
    const existing = tally.get(key(score));
    if (existing) existing.count += 1;
    else tally.set(key(score), { score, count: 1 });
  }

  const candidates = [...tally.values()];
  const best = Math.max(...candidates.map((c) => c.count));
  const leaders = candidates.filter((c) => c.count === best);

  const winner =
    leaders.length === 1
      ? leaders[0]!
      : // Everyone disagrees equally: take whichever candidate sits closest to the
        // whole set of reports, then the lower scoreline so the result is stable.
        [...leaders].sort((x, y) => {
          const dx = totalDistance(x.score, normalised);
          const dy = totalDistance(y.score, normalised);
          if (dx !== dy) return dx - dy;
          if (x.score.a !== y.score.a) return x.score.a - y.score.a;
          return x.score.b - y.score.b;
        })[0]!;

  return {
    score: winner.score,
    agreed: winner.count,
    total: usable.length,
    unanimous: winner.count === usable.length,
    contested: leaders.length > 1,
  };
}

function totalDistance(candidate: Scoreline, all: Scoreline[]): number {
  return all.reduce(
    (sum, s) => sum + Math.abs(s.a - candidate.a) + Math.abs(s.b - candidate.b),
    0,
  );
}

/** What a given side got out of the night. */
export function outcomeFor(side: Side, score: Scoreline) {
  const mine = side === "a" ? score.a : score.b;
  const theirs = side === "a" ? score.b : score.a;
  if (mine > theirs) return "win" as const;
  if (mine < theirs) return "loss" as const;
  return "draw" as const;
}

/** Reads a settled score out loud, for the chat. */
export function describeScore(consensus: ScoreConsensus, names: Record<Side, string>): string {
  if (!consensus.score) return "Nobody could agree what the score was, so it never happened.";

  const { a, b } = consensus.score;
  const headline =
    a === b
      ? `${names.a} ${a}-${b} ${names.b}. Honours even.`
      : a > b
        ? `${names.a} ${a}-${b} ${names.b}.`
        : `${names.b} ${b}-${a} ${names.a}.`;

  if (consensus.unanimous) return headline;
  return `${headline} (${consensus.agreed} of ${consensus.total} agreed${
    consensus.contested ? ", and it was close" : ""
  }.)`;
}

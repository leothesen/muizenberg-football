import { newBadges, type CareerTotals } from "./badges";
import { performancePoints, rateMatch, type RatingChange } from "./rating";
import { agreeScore, outcomeFor, type ScoreConsensus, type Scoreline } from "./scoring";
import { EMPTY_STAT_LINE, type MatchStatLine, type Outcome, type Side } from "./types";

/**
 * Turning a night's worth of self-reports into a result.
 *
 * This is the hinge of the fantasy layer: the one place where "eleven people typed
 * some numbers into a phone" becomes a score, a set of ratings and a pile of badges.
 * It is deliberately pure — no clock, no database — because it is also the part that
 * is hardest to reason about and easiest to get subtly wrong.
 *
 * Three decisions are baked in and worth naming:
 *
 * 1. **Everyone selected gets rated, whether or not they answered.** Turning up is
 *    the thing the league actually needs, so it earns points on its own. Answering
 *    the questionnaire earns more, which is the gentlest possible nudge.
 * 2. **Votes only count for people who were on the pitch.** A vote for somebody who
 *    was not selected is dropped rather than trusted.
 * 3. **Nothing here writes anything.** The caller decides whether to persist, which
 *    is what makes re-settling a fixture safe to reason about.
 */

export interface SettlementPlayer {
  playerId: string;
  displayName: string;
  emoji: string;
  /** Rating going into tonight. */
  rating: number;
  side: Side;
  isSub: boolean;
}

/** One submitted questionnaire, already stripped of database shapes. */
export interface SubmittedReport {
  playerId: string;
  goals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
  ownGoals: number;
  selfRating: number | null;
  motmVoteFor: string | null;
  /** From this player's own point of view; null if they never got that far. */
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export interface SettlementContext {
  players: SettlementPlayer[];
  reports: SubmittedReport[];
  /** Career totals *before* tonight. A missing entry means this is a debut. */
  careerBefore: ReadonlyMap<string, CareerTotals>;
  /** Consecutive fixtures played before tonight. */
  streakBefore: ReadonlyMap<string, number>;
  /** Badge codes already held, so nothing is awarded twice. */
  badgesHeld: ReadonlyMap<string, ReadonlySet<string>>;
  /** Whoever said yes first when the poll went out. */
  firstToRespondPlayerId: string | null;
  /** Anyone who came off the waitlist to make the numbers up. */
  promotedPlayerIds: ReadonlySet<string>;
  /**
   * A score already written against the fixture. Used only when the reports cannot
   * produce one — which in normal operation never happens, since the settlement is
   * what writes it. It matters when replaying history that was recorded some other
   * way: ignoring a score the league already agrees on would be the wrong kind of
   * purity.
   */
  recordedScore?: Scoreline | null;
}

export interface PlayerSettlement {
  playerId: string;
  displayName: string;
  emoji: string;
  side: Side;
  isSub: boolean;
  stats: MatchStatLine;
  outcome: Outcome | null;
  /** Fantasy points on the night — the same currency the rating engine spends. */
  points: number;
  /** False when they never answered the questionnaire. */
  reported: boolean;
  selfRating: number | null;
  rating: RatingChange;
  /** Codes earned tonight. */
  badges: string[];
  wasMotm: boolean;
}

export interface MotmWinner {
  playerId: string;
  displayName: string;
  emoji: string;
  votes: number;
}

export type ScoreSource = "reports" | "recorded" | "none";

export interface Settlement {
  consensus: ScoreConsensus;
  /** Null when nobody reported a score and none was on record. */
  score: Scoreline | null;
  /** Where the score above came from, so the message can say the right thing. */
  scoreSource: ScoreSource;
  /** Everyone tied on the most votes. Usually one, occasionally two. */
  motm: MotmWinner[];
  players: PlayerSettlement[];
  /** The night's best performances, best first. */
  teamOfTheWeek: PlayerSettlement[];
  /** How many of the selected squad actually answered. */
  reportedCount: number;
}

/** How many make the team of the week. Five out of ~16 keeps it worth winning. */
export const TEAM_OF_THE_WEEK_SIZE = 5;

const NO_CAREER: CareerTotals = {
  appearances: 0,
  goals: 0,
  assists: 0,
  nutmegs: 0,
  motmAwards: 0,
};

export function settleFixture(ctx: SettlementContext): Settlement {
  const selected = new Set(ctx.players.map((p) => p.playerId));
  const sideOf = new Map(ctx.players.map((p) => [p.playerId, p.side] as const));

  // A report from somebody who was not selected is a bug upstream, not a result.
  const reports = ctx.reports.filter((r) => selected.has(r.playerId));
  const reportById = new Map(reports.map((r) => [r.playerId, r] as const));

  const consensus = agreeScore(
    reports
      .filter((r) => r.goalsFor !== null && r.goalsAgainst !== null)
      .map((r) => ({
        playerId: r.playerId,
        side: sideOf.get(r.playerId) ?? "a",
        goalsFor: r.goalsFor as number,
        goalsAgainst: r.goalsAgainst as number,
      })),
  );

  const score = consensus.score ?? ctx.recordedScore ?? null;
  const scoreSource: ScoreSource = consensus.score
    ? "reports"
    : ctx.recordedScore
      ? "recorded"
      : "none";

  const votes = tallyVotes(reports, selected);
  const motmIds = topVoted(votes);

  // First pass: what everybody actually did. The rating cannot be worked out until
  // the whole night is known, because a rating is a comparison with the other people
  // on the pitch rather than an absolute score.
  const nights = ctx.players.map((player) => {
    const report = reportById.get(player.playerId);
    const motmVotes = votes.get(player.playerId) ?? 0;

    const stats: MatchStatLine = report
      ? {
          goals: report.goals,
          assists: report.assists,
          nutmegs: report.nutmegs,
          tackles: report.tackles,
          saves: report.saves,
          ownGoals: report.ownGoals,
          motmVotes,
        }
      : { ...EMPTY_STAT_LINE, motmVotes };

    const outcome = score ? outcomeFor(player.side, score) : null;

    return { player, report, stats, outcome, points: performancePoints(stats, outcome) };
  });

  const leagueAverage = mean(nights.map((n) => n.points));

  const players = nights.map(({ player, report, stats, outcome, points }) => {
    const wasMotm = motmIds.has(player.playerId);

    const before = ctx.careerBefore.get(player.playerId) ?? NO_CAREER;
    const career: CareerTotals = {
      appearances: before.appearances + 1,
      goals: before.goals + stats.goals,
      assists: before.assists + stats.assists,
      nutmegs: before.nutmegs + stats.nutmegs,
      motmAwards: before.motmAwards + (wasMotm ? 1 : 0),
    };

    const badges = newBadges({
      match: stats,
      outcome,
      goalsAgainst: score ? concededBy(player.side, score) : null,
      selfRating: report?.selfRating ?? null,
      career,
      streak: (ctx.streakBefore.get(player.playerId) ?? 0) + 1,
      wasMotm,
      firstToRespond: ctx.firstToRespondPlayerId === player.playerId,
      promotedFromWaitlist: ctx.promotedPlayerIds.has(player.playerId),
      alreadyHeld: ctx.badgesHeld.get(player.playerId) ?? EMPTY_BADGES,
    });

    return {
      playerId: player.playerId,
      displayName: player.displayName,
      emoji: player.emoji,
      side: player.side,
      isSub: player.isSub,
      stats,
      outcome,
      points,
      reported: report !== undefined,
      selfRating: report?.selfRating ?? null,
      rating: rateMatch({ rating: player.rating, stats, outcome, leagueAverage }),
      badges,
      wasMotm,
    } satisfies PlayerSettlement;
  });

  const byId = new Map(players.map((p) => [p.playerId, p] as const));

  return {
    consensus,
    score,
    scoreSource,
    motm: [...motmIds]
      .map((id) => {
        const player = byId.get(id);
        return {
          playerId: id,
          displayName: player?.displayName ?? "Someone",
          emoji: player?.emoji ?? "⚽",
          votes: votes.get(id) ?? 0,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    players,
    teamOfTheWeek: teamOfTheWeek(players),
    reportedCount: reports.length,
  };
}

const EMPTY_BADGES: ReadonlySet<string> = new Set<string>();

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function concededBy(side: Side, score: Scoreline): number {
  return side === "a" ? score.b : score.a;
}

function tallyVotes(
  reports: SubmittedReport[],
  selected: ReadonlySet<string>,
): Map<string, number> {
  const votes = new Map<string, number>();

  for (const report of reports) {
    const target = report.motmVoteFor;
    // No self-votes, and no votes for anyone who was not on the pitch.
    if (!target || target === report.playerId || !selected.has(target)) continue;
    votes.set(target, (votes.get(target) ?? 0) + 1);
  }

  return votes;
}

/** Everyone tied on the most votes. Empty when nobody voted. */
function topVoted(votes: ReadonlyMap<string, number>): Set<string> {
  const counts = [...votes.values()];
  if (counts.length === 0) return new Set();

  const best = Math.max(...counts);
  if (best === 0) return new Set();

  return new Set([...votes.entries()].filter(([, n]) => n === best).map(([id]) => id));
}

/**
 * The night's best five. Only people who actually filed a report are eligible —
 * otherwise a silent winner outranks a busy loser on turning-up points alone, which
 * reads as a bug however defensible the arithmetic is.
 */
export function teamOfTheWeek(
  players: PlayerSettlement[],
  size = TEAM_OF_THE_WEEK_SIZE,
): PlayerSettlement[] {
  return [...players]
    .filter((p) => p.reported)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.stats.motmVotes - a.stats.motmVotes ||
        b.stats.goals - a.stats.goals ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, size);
}

/**
 * How many games in a row a player has turned out for, counting back from the most
 * recent fixture. Fixtures must be newest first; the streak stops at the first one
 * they missed.
 */
export function consecutiveAppearances(
  fixtureIdsNewestFirst: readonly string[],
  appearedIn: ReadonlySet<string>,
): number {
  let streak = 0;
  for (const id of fixtureIdsNewestFirst) {
    if (!appearedIn.has(id)) break;
    streak += 1;
  }
  return streak;
}

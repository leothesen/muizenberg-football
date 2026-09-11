import { formMark, type TableRow } from "@/domain/leaderboards";
import { describeKickoff } from "@/domain/schedule";
import type { PickedTeams } from "@/domain/teams";
import type { Settlement } from "@/domain/settle";
import type { Outcome } from "@/domain/types";
import type { PlayerCardContext } from "@/lib/bot/results";
import type { LeaderboardImageProps } from "./leaderboard-image";
import type { MatchReportImageProps, MatchReportPerformer } from "./match-report-image";
import { MAX_CARD_BADGES, type PlayerCardProps } from "./player-card";
import type { TeamSheetImageProps } from "./team-sheet-image";

/**
 * Turning what the app already knows into what an image needs.
 *
 * Kept out of the JSX so it can be tested without rendering anything: these are the
 * decisions that would otherwise only be visible by squinting at a PNG — which stat
 * line a performer gets, how many performers fit, what to say when the score was
 * never agreed.
 */

/** How many performers the match report picture lists. */
export const MATCH_REPORT_PERFORMERS = 5;

export function playerCardProps(
  card: PlayerCardContext,
  seasonName: string,
): PlayerCardProps {
  return {
    displayName: card.displayName,
    emoji: card.emoji,
    rating: card.rating,
    appearances: card.appearances,
    attributes: card.attributes,
    // The message renders form oldest-to-newest; the card matches so the two agree.
    form: card.recentOutcomes
      .map((outcome) => formMark(outcome as Outcome | null))
      .filter((mark): mark is "W" | "D" | "L" => mark !== null)
      .slice(0, 5)
      .reverse(),
    totals: {
      goals: card.goals,
      assists: card.assists,
      nutmegs: card.nutmegs,
      tackles: card.tackles,
      saves: card.saves,
      motmVotes: card.motmVotes,
    },
    badges: card.badges.slice(0, MAX_CARD_BADGES),
    seasonName,
  };
}

export function leaderboardProps(
  rows: TableRow[],
  seasonName: string,
): LeaderboardImageProps {
  return {
    title: seasonName,
    subtitle: rows.length === 0 ? "No games played yet" : "",
    rows,
  };
}

export function teamSheetProps(params: {
  teams: PickedTeams;
  kickoffAt: Date;
  venue: string;
}): TeamSheetImageProps {
  const side = (sheet: PickedTeams["a"]) => ({
    name: sheet.name,
    colour: sheet.colour,
    starters: sheet.starters.map((p) => ({ displayName: p.displayName, emoji: p.emoji })),
    subs: sheet.subs.map((p) => ({ displayName: p.displayName, emoji: p.emoji })),
  });

  return {
    a: side(params.teams.a),
    b: side(params.teams.b),
    kickoff: describeKickoff(params.kickoffAt),
    venue: params.venue,
  };
}

export function matchReportProps(
  settlement: Settlement,
  params: {
    kickoffAt: Date;
    teamA: { name: string; colour: string };
    teamB: { name: string; colour: string };
  },
): MatchReportImageProps {
  return {
    kickoff: describeKickoff(params.kickoffAt),
    teamA: params.teamA,
    teamB: params.teamB,
    score: settlement.score,
    agreement: agreementLine(settlement),
    motm: settlement.motm.map((m) => ({
      displayName: m.displayName,
      emoji: m.emoji,
      votes: m.votes,
    })),
    performers: settlement.teamOfTheWeek
      .slice(0, MATCH_REPORT_PERFORMERS)
      .map(performerFrom),
  };
}

function performerFrom(player: Settlement["teamOfTheWeek"][number]): MatchReportPerformer {
  return {
    displayName: player.displayName,
    emoji: player.emoji,
    line: statLine(player.stats),
    points: player.points,
  };
}

/** Only what happened, in the same order and icons the chat message uses. */
export function statLine(stats: {
  goals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
  motmVotes: number;
}): string {
  const parts: string[] = [];
  if (stats.goals > 0) parts.push(`${stats.goals} ⚽`);
  if (stats.assists > 0) parts.push(`${stats.assists} 🎁`);
  if (stats.nutmegs > 0) parts.push(`${stats.nutmegs} 🥜`);
  if (stats.tackles > 0) parts.push(`${stats.tackles} 🧱`);
  if (stats.saves > 0) parts.push(`${stats.saves} 🧤`);
  // A dot, not extra spaces: Satori collapses runs of whitespace, so "3 ⚽  2 🎁"
  // renders as "3 ⚽ 2 🎁" and the numbers read as one long figure.
  return parts.join(" · ");
}

/**
 * How firm the scoreline is. Says nothing at all when everyone agreed, because
 * "16 of 16 agreed" is noise; speaks up only when there was a genuine dispute.
 */
export function agreementLine(settlement: Settlement): string {
  if (settlement.scoreSource === "none") {
    return "Nobody reported a score, so this one goes down as a rumour.";
  }

  if (settlement.scoreSource === "recorded") {
    return "Score taken from the record.";
  }

  const { agreed, total, unanimous, contested } = settlement.consensus;
  if (unanimous) return `Agreed by all ${total}.`;
  return contested
    ? `${agreed} of ${total} agreed, and it was close.`
    : `${agreed} of ${total} agreed.`;
}

import { teamsFor } from "@/lib/repo/teams";
import {
  openReportForPlayer,
  recordAnswer,
  recordMotm,
  reportFor,
  submitReport,
} from "@/lib/repo/reports";
import type { ReportDeps } from "./report-handler";
import type { QuestionContext } from "./report-flow";

/**
 * Real implementations for the questionnaire.
 *
 * The only interesting one is questionContext: the questions name the player's own
 * team and offer everyone else who played as a man-of-the-match vote, so it has to
 * know which side they were on.
 */
export function liveReportDeps(): ReportDeps {
  return {
    reportFor,
    openReportForPlayer,
    recordAnswer,
    recordMotm,
    submitReport,
    questionContext,
  };
}

export async function questionContext(
  fixtureId: string,
  playerId: string,
): Promise<QuestionContext | null> {
  const teams = await teamsFor(fixtureId);
  if (teams.length === 0) return null;

  const mine = teams.find((t) => t.players.some((p) => p.playerId === playerId));
  const theirs = teams.find((t) => t.team.id !== mine?.team.id);
  if (!mine) return null;

  const me = mine.players.find((p) => p.playerId === playerId);

  return {
    fixtureId,
    firstName: me?.displayName ?? "you",
    teamName: mine.team.name,
    opponentName: theirs?.team.name ?? "the others",
    peers: teams
      .flatMap((t) => t.players)
      .filter((p) => p.playerId !== playerId)
      .map((p) => ({ playerId: p.playerId, displayName: p.displayName, emoji: p.emoji })),
  };
}

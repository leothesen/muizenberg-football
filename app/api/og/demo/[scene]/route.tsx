import { NextResponse } from "next/server";
import { describeKickoff } from "@/domain/schedule";
import { imageResponse } from "@/lib/og/render";
import { MatchReportImage, matchReportSize } from "@/lib/og/match-report-image";
import { TeamSheetImage, teamSheetSize } from "@/lib/og/team-sheet-image";
import { statSummary } from "@/lib/bot/stats";
import {
  DEMO_KICKOFF,
  DEMO_RESULT,
  DEMO_TEAMS,
  DEMO_VENUE,
} from "@/lib/demo/transcript";

export const runtime = "nodejs";

/**
 * The two pictures on the "how it works" page.
 *
 * Drawn by the same components that draw the real ones, from the same made-up week
 * the transcript is built on — so the page shows the actual artefact rather than a
 * screenshot that will be out of date by the next design change.
 *
 * They take no database, which is the whole reason they exist. A league that has not
 * played yet has no team sheet and no result, and that is precisely the week people
 * are deciding whether to install Telegram for this.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scene: string }> },
): Promise<Response> {
  const { scene } = await params;
  const kickoff = describeKickoff(DEMO_KICKOFF);

  if (scene === "teams") {
    const props = {
      a: {
        name: DEMO_TEAMS.a.name,
        colour: DEMO_TEAMS.a.colour,
        starters: DEMO_TEAMS.a.starters.map(({ displayName, emoji }) => ({ displayName, emoji })),
        subs: [],
      },
      b: {
        name: DEMO_TEAMS.b.name,
        colour: DEMO_TEAMS.b.colour,
        starters: DEMO_TEAMS.b.starters.map(({ displayName, emoji }) => ({ displayName, emoji })),
        subs: [],
      },
      kickoff,
      venue: DEMO_VENUE,
    };

    return imageResponse(<TeamSheetImage {...props} />, teamSheetSize(props));
  }

  if (scene === "match") {
    const props = {
      kickoff,
      teamA: { name: DEMO_TEAMS.a.name, colour: DEMO_TEAMS.a.colour },
      teamB: { name: DEMO_TEAMS.b.name, colour: DEMO_TEAMS.b.colour },
      score: { a: DEMO_RESULT.score.a, b: DEMO_RESULT.score.b },
      agreement: DEMO_RESULT.agreement,
      motm: DEMO_RESULT.motm.map((m) => ({ ...m })),
      performers: DEMO_RESULT.performers.map((p) => ({
        displayName: p.displayName,
        emoji: p.emoji,
        line: statSummary({
          goals: p.goals,
          assists: p.assists,
          nutmegs: p.nutmegs,
          tackles: p.tackles,
        }),
        points: p.points,
      })),
    };

    return imageResponse(<MatchReportImage {...props} />, matchReportSize(props));
  }

  return NextResponse.json({ error: "no such demo scene" }, { status: 404 });
}

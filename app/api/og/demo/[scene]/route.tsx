import { NextResponse } from "next/server";
import { imageResponse } from "@/lib/og/render";
import { MatchReportImage, matchReportSize } from "@/lib/og/match-report-image";
import { TeamSheetImage, teamSheetSize } from "@/lib/og/team-sheet-image";
import { demoMatchReportProps, demoTeamSheetProps } from "@/lib/demo/transcript";

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
 *
 * The props come from the transcript rather than being built here, because the page
 * reserves each picture's space from the size those props produce. One source means
 * the box on the page and the picture that fills it cannot disagree.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scene: string }> },
): Promise<Response> {
  const { scene } = await params;

  if (scene === "teams") {
    const props = demoTeamSheetProps();
    return imageResponse(<TeamSheetImage {...props} />, teamSheetSize(props));
  }

  if (scene === "match") {
    const props = demoMatchReportProps();
    return imageResponse(<MatchReportImage {...props} />, matchReportSize(props));
  }

  return NextResponse.json({ error: "no such demo scene" }, { status: 404 });
}

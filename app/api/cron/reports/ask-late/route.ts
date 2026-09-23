import { NextResponse } from "next/server";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { fixtureAwaitingReports } from "@/lib/repo/fixtures";
import { reportsOpened } from "@/lib/repo/reports";
import { GET as askForReports } from "../ask/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Match night, later: ask about a game that kicked off after 17:30.
 *
 * The group can vote the kickoff as late as 19:00 in summer, and the 18:30 run finds
 * nothing to ask about for any game that has not been going an hour by then. On the
 * Hobby plan a cron runs once a day, so the only way to catch a later game the same
 * evening is a second cron — this one, at 20:00.
 *
 * It asks only about a game nobody has been asked about yet. The 18:30 run posts for a
 * 17:30 game, and a second post two hours later naming everybody who has not filed
 * would be a nag, not a question. Which also means it catches a 17:30 game whose 18:30
 * run fired early in the hour and missed it, which Vercel's hour-level timing allows.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const fixture = await fixtureAwaitingReports(new Date());
  if (!fixture) {
    return NextResponse.json({ ok: true, skipped: "no fixture awaiting reports" });
  }

  if (await reportsOpened(fixture.id)) {
    return NextResponse.json({ ok: true, skipped: "already asked", fixtureId: fixture.id });
  }

  return askForReports(request);
}

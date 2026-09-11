import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { GET as askReports } from "@/app/api/cron/reports/ask/route";
import { GET as settleResults } from "@/app/api/cron/results/settle/route";
import { GET as nudgeRsvp } from "@/app/api/cron/rsvp/nudge/route";
import { GET as openRsvp } from "@/app/api/cron/rsvp/open/route";
import { GET as pickTeams } from "@/app/api/cron/teams/pick/route";
import { db } from "@/lib/db";
import { fixtures } from "@/lib/db/schema";
import { devToolsEnabled } from "@/lib/dev-guard";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Driving the week from the emulator.
 *
 * The scheduled messages are the ones you cannot see by tapping anything — they
 * arrive because a cron fired on a Tuesday. This runs the real cron handlers on
 * demand, so the emulator can show the whole week without waiting a week.
 *
 * It exists rather than the buttons calling the cron routes directly because those
 * routes want `Authorization: Bearer $CRON_SECRET`, and the emulator is a browser
 * page. Putting the secret in the page to let it authenticate to its own server would
 * be a strange way to protect anything. The secret is read here instead and never
 * leaves the server.
 */

type Step =
  | "rsvp-open"
  | "rsvp-nudge"
  | "teams-pick"
  | "play"
  | "reports-ask"
  | "results-settle";

const CRONS: Partial<Record<Step, (request: Request) => Promise<Response>>> = {
  "rsvp-open": openRsvp,
  "rsvp-nudge": nudgeRsvp,
  "teams-pick": pickTeams,
  "reports-ask": askReports,
  "results-settle": settleResults,
};

/**
 * How long ago the game has to have been for the rest of the week to run.
 *
 * Fourteen hours is Wednesday 18:00 to Thursday 08:00, the real gap. It matters
 * because settlement refuses a fixture less than twelve hours old — everybody is
 * meant to have had a night to answer the questionnaire — so a fixture that kicks off
 * next week can never be settled, and both the questionnaire and the report quietly
 * do nothing. Same move `pnpm mock:week` makes, for the same reason.
 */
const HOURS_SINCE_KICKOFF = 14;

async function play(): Promise<Response> {
  const kickoff = new Date(Date.now() - HOURS_SINCE_KICKOFF * 60 * 60 * 1000);

  const played = await db()
    .update(fixtures)
    .set({ kickoff_at: kickoff.toISOString() })
    .where(eq(fixtures.status, "locked"))
    .returning({ id: fixtures.id });

  if (played.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No locked fixture — pick the teams first." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, played: played.length, kickoff });
}

export async function POST(request: Request): Promise<Response> {
  if (!devToolsEnabled()) {
    return NextResponse.json({ ok: false, error: "not available" }, { status: 404 });
  }

  const { step } = (await request.json()) as { step?: Step };

  if (step === "play") return play();

  const handler = step ? CRONS[step] : undefined;
  if (!handler) {
    return NextResponse.json({ ok: false, error: `unknown step: ${step}` }, { status: 400 });
  }

  // Authenticated here, server side, so the browser never holds the secret.
  const secret = optionalEnv("CRON_SECRET");
  const headers = secret ? { authorization: `Bearer ${secret}` } : undefined;

  return handler(new Request("http://emulator.local/cron", { headers }));
}

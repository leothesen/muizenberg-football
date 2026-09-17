import { NextResponse } from "next/server";
import { z } from "zod";
import { currentPlayer } from "@/lib/auth/current-user";
import { reportForm } from "@/lib/bot/report-form";
import { accepts, type CountField } from "@/lib/bot/report-flow";
import { questionContext } from "@/lib/bot/report-services";
import { fileReport, openReportForPlayer, reportFor } from "@/lib/repo/reports";
import { fixtureById } from "@/lib/repo/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Filling in the questionnaire without a private chat.
 *
 * The post-match questions are a DM, and a bot may not open a DM — it can only reply
 * inside a private chat somebody started first. So a player who has never messaged
 * the bot could not be asked at all, and there was nowhere else to answer: no form on
 * the site, nothing in the Mini App. They were dropped in one silent line on match
 * night and counted as not having bothered the morning after.
 *
 * This is the other door. Same report row, same columns, same `submitted_at` that
 * settlement counts — so nothing downstream can tell which door an answer came
 * through, which is exactly right. The Mini App's signed `initData` is the login, as
 * everywhere else here; there is no password and nothing to sign up for.
 */

const COUNTS = [
  "goals",
  "assists",
  "nutmegs",
  "tackles",
  "saves",
  "scoreFor",
  "scoreAgainst",
  "rating",
] as const satisfies readonly CountField[];

/**
 * Validated against the same tables the chat buttons are built from, rather than
 * against a range. A form is an open door in a way an inline keyboard is not: the
 * buttons can only send what they were drawn with, but anybody can POST here, and
 * "goals: 900000" in the table would be somebody's afternoon to undo.
 */
const Submission = z.object({
  fixtureId: z.string().uuid(),
  goals: z.number().int().optional(),
  assists: z.number().int().optional(),
  nutmegs: z.number().int().optional(),
  tackles: z.number().int().optional(),
  saves: z.number().int().optional(),
  scoreFor: z.number().int().optional(),
  scoreAgainst: z.number().int().optional(),
  rating: z.number().int().optional(),
  motmPlayerId: z.string().uuid().nullable().optional(),
});

/** What this player still owes, and the questions to ask for it. */
export async function GET(): Promise<Response> {
  const player = await currentPlayer();
  if (!player)
    return NextResponse.json({ ok: false, signedIn: false }, { status: 401 });

  const report = await openReportForPlayer(player.id);
  if (!report) return NextResponse.json({ ok: true, report: null });

  const context = await questionContext(report.fixture_id, player.id);
  if (!context) return NextResponse.json({ ok: true, report: null });

  const fixture = await fixtureById(report.fixture_id);

  return NextResponse.json({
    ok: true,
    report: {
      ...reportForm(context),
      kickoffAt: fixture?.kickoff_at ?? null,
      venue: fixture?.venue ?? null,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const player = await currentPlayer();
  if (!player)
    return NextResponse.json({ ok: false, signedIn: false }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid json" },
      { status: 400 },
    );
  }

  const parsed = Submission.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "not a report" },
      { status: 400 },
    );
  }

  for (const field of COUNTS) {
    const value = parsed.data[field];
    if (value !== undefined && !accepts(field, value)) {
      return NextResponse.json(
        { ok: false, error: `${field} is not one of the answers on offer` },
        { status: 400 },
      );
    }
  }

  // Resolved from the session rather than taken from the body: the client says which
  // fixture, never whose report. There is nothing to tamper with.
  const report = await reportFor(parsed.data.fixtureId, player.id);
  if (!report) {
    return NextResponse.json(
      { ok: false, error: "you were not on that team sheet" },
      { status: 404 },
    );
  }

  if (report.submitted_at) {
    // Not an error. Two taps on a slow connection, or a DM finished after the form
    // was opened — either way the answer that landed first stands.
    return NextResponse.json({ ok: true, alreadyFiled: true });
  }

  // A vote for somebody who was not on the pitch is the one thing the form can say
  // and the buttons cannot, so it is checked here rather than trusted.
  const context = await questionContext(report.fixture_id, player.id);
  const motm = parsed.data.motmPlayerId ?? null;
  if (motm && !context?.peers.some((peer) => peer.playerId === motm)) {
    return NextResponse.json(
      { ok: false, error: "they did not play" },
      { status: 400 },
    );
  }

  const {
    fixtureId: _fixtureId,
    motmPlayerId: _motm,
    ...answers
  } = parsed.data;
  const filed = await fileReport(report.id, { ...answers, motmPlayerId: motm });

  return NextResponse.json({
    ok: true,
    filed: {
      goals: filed.goals,
      assists: filed.assists,
      nutmegs: filed.nutmegs,
      tackles: filed.tackles,
      saves: filed.saves,
    },
  });
}

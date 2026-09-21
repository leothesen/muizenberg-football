import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { matchReports } from "@/lib/db/schema";
import type { ReportField } from "@/lib/telegram/callbacks";
import type { FlowState } from "@/lib/bot/report-flow";

export type MatchReportRow = typeof matchReports.$inferSelect;

/**
 * The post-match self-report.
 *
 * One row per player per fixture, created when the questionnaire is sent and updated
 * a tap at a time. The flow position lives on the row rather than in memory so an
 * unfinished questionnaire survives a redeploy — people answer these hours later,
 * from bed.
 */

type MatchReportUpdate = Partial<typeof matchReports.$inferInsert>;

/**
 * Which column each question writes to. An exhaustive switch rather than a lookup
 * map: a computed key widens the update object to a string index signature, which
 * throws away every guarantee the row types give us.
 */
function answerPatch(field: ReportField, value: number): MatchReportUpdate {
  switch (field) {
    case "goals":
      return { goals: value };
    case "assists":
      return { assists: value };
    case "nutmegs":
      return { nutmegs: value };
    case "tackles":
      return { tackles: value };
    case "saves":
      return { saves: value };
    case "scoreFor":
      return { reported_goals_for: value };
    case "scoreAgainst":
      return { reported_goals_against: value };
    case "rating":
      return { self_rating: value };
  }
}

export async function ensureReport(
  fixtureId: string,
  playerId: string,
): Promise<MatchReportRow> {
  const existing = await reportFor(fixtureId, playerId);
  if (existing) return existing;

  // Two questionnaire sends for the same player can race. The unique index on
  // (fixture_id, player_id) settles it and the loser reads the winner's row.
  const [created] = await db()
    .insert(matchReports)
    .values({
      fixture_id: fixtureId,
      player_id: playerId,
      flow_state: "not_started",
    })
    .onConflictDoNothing({
      target: [matchReports.fixture_id, matchReports.player_id],
    })
    .returning();

  if (created) return created;

  const raced = await reportFor(fixtureId, playerId);
  if (raced) return raced;

  throw new Error(
    `could not open a report for player ${playerId} on fixture ${fixtureId}`,
  );
}

export async function reportFor(
  fixtureId: string,
  playerId: string,
): Promise<MatchReportRow | null> {
  const [row] = await db()
    .select()
    .from(matchReports)
    .where(
      and(
        eq(matchReports.fixture_id, fixtureId),
        eq(matchReports.player_id, playerId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** The one questionnaire a player still has open, if any. */
export async function openReportForPlayer(
  playerId: string,
): Promise<MatchReportRow | null> {
  const [row] = await db()
    .select()
    .from(matchReports)
    .where(
      and(
        eq(matchReports.player_id, playerId),
        // Open means unsubmitted. That is what lets somebody wander off mid-flow and
        // finish from bed three hours later.
        isNull(matchReports.submitted_at),
      ),
    )
    .orderBy(desc(matchReports.created_at))
    .limit(1);

  return row ?? null;
}

export async function recordAnswer(
  reportId: string,
  field: ReportField,
  value: number,
  nextState: FlowState,
): Promise<MatchReportRow> {
  const [row] = await db()
    .update(matchReports)
    .set({ ...answerPatch(field, value), flow_state: nextState })
    .where(eq(matchReports.id, reportId))
    .returning();

  return row!;
}

export async function recordMotm(
  reportId: string,
  motmPlayerId: string,
  nextState: FlowState,
): Promise<MatchReportRow> {
  const [row] = await db()
    .update(matchReports)
    .set({ motm_player_id: motmPlayerId, flow_state: nextState })
    .where(eq(matchReports.id, reportId))
    .returning();

  return row!;
}

export async function setFlowState(
  reportId: string,
  flowState: FlowState,
  flowMessageId?: number,
): Promise<void> {
  await db()
    .update(matchReports)
    .set({
      flow_state: flowState,
      ...(flowMessageId === undefined
        ? {}
        : { flow_message_id: flowMessageId }),
    })
    .where(eq(matchReports.id, reportId));
}

/** Marks the questionnaire finished, whether it was completed or abandoned. */
export async function submitReport(reportId: string): Promise<MatchReportRow> {
  const [row] = await db()
    .update(matchReports)
    .set({ flow_state: "done", submitted_at: new Date().toISOString() })
    .where(eq(matchReports.id, reportId))
    .returning();

  return row!;
}

export async function submittedReports(
  fixtureId: string,
): Promise<MatchReportRow[]> {
  return db()
    .select()
    .from(matchReports)
    .where(
      and(
        eq(matchReports.fixture_id, fixtureId),
        isNotNull(matchReports.submitted_at),
      ),
    );
}

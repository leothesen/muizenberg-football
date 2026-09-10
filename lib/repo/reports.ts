import { db } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { ReportField } from "@/lib/telegram/callbacks";
import type { FlowState } from "@/lib/bot/report-flow";

export type MatchReportRow = Database["public"]["Tables"]["match_reports"]["Row"];

/**
 * The post-match self-report.
 *
 * One row per player per fixture, created when the questionnaire is sent and updated
 * a tap at a time. The flow position lives on the row rather than in memory so an
 * unfinished questionnaire survives a redeploy — people answer these hours later,
 * from bed.
 */

type MatchReportUpdate = Database["public"]["Tables"]["match_reports"]["Update"];

/**
 * Which column each question writes to. An exhaustive switch rather than a lookup
 * map: a computed key widens the update object to a string index signature, which
 * throws away every guarantee the generated row types give us.
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
  const { data: existing, error: readError } = await db()
    .from("match_reports")
    .select("*")
    .eq("fixture_id", fixtureId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;

  const { data, error } = await db()
    .from("match_reports")
    .insert({ fixture_id: fixtureId, player_id: playerId, flow_state: "not_started" })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await reportFor(fixtureId, playerId);
      if (raced) return raced;
    }
    throw error;
  }
  return data;
}

export async function reportFor(
  fixtureId: string,
  playerId: string,
): Promise<MatchReportRow | null> {
  const { data, error } = await db()
    .from("match_reports")
    .select("*")
    .eq("fixture_id", fixtureId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The one questionnaire a player still has open, if any. */
export async function openReportForPlayer(playerId: string): Promise<MatchReportRow | null> {
  const { data, error } = await db()
    .from("match_reports")
    .select("*")
    .eq("player_id", playerId)
    .is("submitted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function recordAnswer(
  reportId: string,
  field: ReportField,
  value: number,
  nextState: FlowState,
): Promise<MatchReportRow> {
  const { data, error } = await db()
    .from("match_reports")
    .update({ ...answerPatch(field, value), flow_state: nextState })
    .eq("id", reportId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function recordMotm(
  reportId: string,
  motmPlayerId: string,
  nextState: FlowState,
): Promise<MatchReportRow> {
  const { data, error } = await db()
    .from("match_reports")
    .update({ motm_player_id: motmPlayerId, flow_state: nextState })
    .eq("id", reportId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function setFlowState(
  reportId: string,
  flowState: FlowState,
  flowMessageId?: number,
): Promise<void> {
  const { error } = await db()
    .from("match_reports")
    .update({
      flow_state: flowState,
      ...(flowMessageId === undefined ? {} : { flow_message_id: flowMessageId }),
    })
    .eq("id", reportId);
  if (error) throw error;
}

/** Marks the questionnaire finished, whether it was completed or abandoned. */
export async function submitReport(reportId: string): Promise<MatchReportRow> {
  const { data, error } = await db()
    .from("match_reports")
    .update({ flow_state: "done", submitted_at: new Date().toISOString() })
    .eq("id", reportId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function submittedReports(fixtureId: string): Promise<MatchReportRow[]> {
  const { data, error } = await db()
    .from("match_reports")
    .select("*")
    .eq("fixture_id", fixtureId)
    .not("submitted_at", "is", null);
  if (error) throw error;
  return data ?? [];
}

import type { TelegramClient } from "@/lib/telegram/client";
import type { CallbackAction, ReportField } from "@/lib/telegram/callbacks";
import type { TelegramCallbackQuery } from "@/lib/telegram/types";
import { effectForReport, effectId } from "@/lib/telegram/effects";
import type { MatchReportRow } from "@/lib/repo/reports";
import {
  completionMessage,
  expectedStateFor,
  isComplete,
  nextState,
  questionFor,
  type FlowState,
  type QuestionContext,
} from "./report-flow";

/**
 * Advancing the post-match questionnaire.
 *
 * Each tap writes one answer, moves the flow on and rewrites the same message with
 * the next question, so the whole thing stays a single message in the chat rather
 * than a growing wall of questions.
 */

export interface ReportDeps {
  reportFor(fixtureId: string, playerId: string): Promise<MatchReportRow | null>;
  openReportForPlayer(playerId: string): Promise<MatchReportRow | null>;
  recordAnswer(
    reportId: string,
    field: ReportField,
    value: number,
    next: FlowState,
  ): Promise<MatchReportRow>;
  recordMotm(reportId: string, motmPlayerId: string, next: FlowState): Promise<MatchReportRow>;
  submitReport(reportId: string): Promise<MatchReportRow>;
  questionContext(fixtureId: string, playerId: string): Promise<QuestionContext | null>;
}

export interface ReportContext {
  client: TelegramClient;
  reports: ReportDeps;
}

export async function handleReportAction(
  ctx: ReportContext,
  query: TelegramCallbackQuery,
  action: Extract<CallbackAction, { kind: "report" | "reportMotm" | "reportSkip" }>,
  playerId: string,
): Promise<void> {
  const report = await locateReport(ctx, action, playerId);

  if (!report) {
    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: "That questionnaire has already been filed.",
      show_alert: true,
    });
    return;
  }

  if (report.submitted_at) {
    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: "Already logged. Nothing more to do.",
    });
    return;
  }

  const current = report.flow_state as FlowState;

  // Only accept an answer to the question actually being asked. Telegram keeps old
  // keyboards tappable, so without this a stale button could write to a field the
  // flow has moved past, or skip questions entirely.
  const expected = expectedStateFor(action);
  if (expected !== null && expected !== current) {
    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: "That one's already answered — use the buttons below.",
    });
    const context = await ctx.reports.questionContext(report.fixture_id, playerId);
    const question = context ? questionFor(current, context) : null;
    if (question) await rewrite(ctx, query, report, question.text, question.keyboard);
    return;
  }

  const advanced =
    action.kind === "reportSkip"
      ? await ctx.reports.submitReport(report.id)
      : action.kind === "report"
        ? await ctx.reports.recordAnswer(report.id, action.field, action.value, nextState(current))
        : await ctx.reports.recordMotm(report.id, action.playerId, nextState(current));

  await ctx.client.answerCallbackQuery({ callback_query_id: query.id });

  const state = advanced.flow_state as FlowState;
  const finished = action.kind === "reportSkip" || isComplete(state);

  if (finished) {
    const final = advanced.submitted_at ? advanced : await ctx.reports.submitReport(report.id);
    await rewrite(ctx, query, report, completionMessage(statsOf(final)), undefined);
    await celebrate(ctx, query, final);
    return;
  }

  const context = await ctx.reports.questionContext(report.fixture_id, playerId);
  const question = context ? questionFor(state, context) : null;

  if (!question) {
    const final = await ctx.reports.submitReport(report.id);
    await rewrite(ctx, query, report, completionMessage(statsOf(final)), undefined);
    await celebrate(ctx, query, final);
    return;
  }

  await rewrite(ctx, query, report, question.text, question.keyboard);
}

/**
 * A small animated thank-you once the questionnaire is done.
 *
 * A separate message rather than part of the rewrite, because effects ride on
 * `sendMessage` and the questionnaire is updated with `editMessageText`. Only in a
 * private chat — which is where the questionnaire lives, and the only place Telegram
 * allows an effect at all. Failure here is swallowed: this is decoration, and the
 * report is already safely stored by the time it runs.
 */
async function celebrate(
  ctx: ReportContext,
  query: TelegramCallbackQuery,
  report: MatchReportRow,
): Promise<void> {
  const chatId = query.message?.chat.id;
  if (!chatId || query.message?.chat.type !== "private") return;

  const stats = statsOf(report);

  try {
    await ctx.client.sendWithEffect({
      chat_id: chatId,
      text: signOff(stats.goals, report.own_goals),
      parse_mode: "HTML",
      message_effect_id: effectId(
        effectForReport({ goals: stats.goals, badges: 0, ownGoals: report.own_goals }),
      ),
    });
  } catch {
    // Confetti is not worth an error path.
  }
}

function signOff(goals: number, ownGoals: number): string {
  if (goals >= 3) return "Filed. And a hat-trick. Insufferable all week, as usual.";
  if (ownGoals > 0) return "Filed — own goal and all. Respect for admitting it.";
  if (goals > 0) return "Filed. Nice one.";
  // Not "see you next Wednesday": which night happens is a vote now, and the sign-off
  // on the last message of the week should not be the one thing still promising one.
  return "Filed. See you next week.";
}

/**
 * A man-of-the-match vote cannot carry a fixture id — two UUIDs do not fit in
 * Telegram's 64-byte callback data — so it is resolved against whichever
 * questionnaire the voter still has open.
 */
async function locateReport(
  ctx: ReportContext,
  action: Extract<CallbackAction, { kind: "report" | "reportMotm" | "reportSkip" }>,
  playerId: string,
): Promise<MatchReportRow | null> {
  if (action.kind === "reportMotm") return ctx.reports.openReportForPlayer(playerId);
  return ctx.reports.reportFor(action.fixtureId, playerId);
}

async function rewrite(
  ctx: ReportContext,
  query: TelegramCallbackQuery,
  report: MatchReportRow,
  text: string,
  keyboard: Parameters<TelegramClient["editMessageText"]>[0]["reply_markup"],
): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = report.flow_message_id ?? query.message?.message_id;
  if (!chatId || !messageId) return;

  await ctx.client.editMessageText({
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

function statsOf(report: MatchReportRow) {
  return {
    goals: report.goals,
    assists: report.assists,
    nutmegs: report.nutmegs,
    tackles: report.tackles,
    saves: report.saves,
  };
}

import type { TelegramClient } from "@/lib/telegram/client";
import type { CallbackAction, ReportField } from "@/lib/telegram/callbacks";
import type { TelegramCallbackQuery } from "@/lib/telegram/types";
import { effectForReport, effectId } from "@/lib/telegram/effects";
import type { MatchReportRow } from "@/lib/repo/reports";
import {
  completionMessage,
  expectedStateFor,
  firstState,
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
 *
 * It normally lives in the group, as a message only the person answering can see.
 * That is not a nicety: a bot may not open a private chat, so a questionnaire that
 * could only be a DM reached nobody who had never messaged the bot — which, on the
 * first real Wednesday, was everybody. A private chat still works if somebody taps
 * from one; the two differ only in which Telegram method edits the message.
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
  /**
   * Point a questionnaire at the message that is now showing it. A report can be
   * handed over more than once — tapping the button again after losing the first
   * copy sends a fresh one — and the flow rewrites whichever it was last told about.
   */
  setFlowState(reportId: string, state: FlowState, messageId?: number): Promise<void>;
}

export interface ReportContext {
  client: TelegramClient;
  reports: ReportDeps;
  /**
   * Where a questionnaire lives when the tap carries no chat. Telegram attaches the
   * message a button belongs to, but nothing here should depend on that being true of
   * a message only one person can see.
   */
  leagueChatId?: number;
  /**
   * True once the game has been settled. A questionnaire started before settlement
   * and finished after it was told "Logged" while its answers were never counted.
   */
  settled?(fixtureId: string): Promise<boolean>;
}

export const TOO_LATE_TO_REPORT =
  "That game's been settled, so it's too late to log it. The report's in the group.";

/**
 * Somebody tapped "Add the score & my stats" under the post-match message.
 *
 * Hands them the question they are up to — the first, or wherever they left off —
 * as a message in the group only they can see. Sent in reply to the tap on purpose:
 * a message only one person can see is not guaranteed to arrive if they are offline,
 * and somebody who has just pressed a button is not.
 */
export async function startQuestionnaire(
  ctx: ReportContext,
  query: TelegramCallbackQuery,
  fixtureId: string,
  playerId: string,
): Promise<void> {
  const report = await ctx.reports.reportFor(fixtureId, playerId);

  if (!report) {
    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: "You weren't on the team sheet for that game, so there's nothing to log.",
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
  const asking = current === "not_started" ? firstState() : current;
  const context = await ctx.reports.questionContext(report.fixture_id, playerId);
  const question = context ? questionFor(asking, context) : null;

  if (!question) {
    await ctx.client.answerCallbackQuery({ callback_query_id: query.id });
    return;
  }

  const chat = query.message?.chat;
  let messageId: number;

  if (chat?.type === "private") {
    await ctx.client.answerCallbackQuery({ callback_query_id: query.id });
    const sent = await ctx.client.sendMessage({
      chat_id: chat.id,
      text: question.text,
      parse_mode: "HTML",
      reply_markup: question.keyboard,
    });
    messageId = sent.message_id;
  } else {
    const chatId = chat?.id ?? ctx.leagueChatId;
    if (!chatId) {
      await ctx.client.answerCallbackQuery({ callback_query_id: query.id });
      return;
    }

    // The callback id rides on the send, which is what stops the button spinning.
    // Answering it separately as well would be an error from Telegram.
    const sent = await ctx.client.sendEphemeral(chatId, query.from.id, question.text, {
      replyMarkup: question.keyboard,
      callbackQueryId: query.id,
    });
    // Telegram reports message_id as 0 for these; the real id is ephemeral_message_id.
    // Storing the 0 left every questionnaire stuck on its first question.
    messageId = sent.ephemeral_message_id ?? sent.message_id;
  }

  await ctx.reports.setFlowState(report.id, asking, messageId);
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

  if (await ctx.settled?.(report.fixture_id)) {
    await ctx.client.answerCallbackQuery({
      callback_query_id: query.id,
      text: TOO_LATE_TO_REPORT,
      show_alert: true,
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
 * `sendMessage` and the questionnaire is updated with an edit. Only in a private chat,
 * the only place Telegram allows an effect at all — a questionnaire answered in the
 * group ends on the completion message alone. Failure here is swallowed: this is
 * decoration, and the report is already safely stored by the time it runs.
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

/**
 * Replace the questionnaire message with the next question, or with the summary.
 *
 * A message only one person can see is not an ordinary message: it is edited with its
 * own method, addressed by chat, receiver and its own id. `editMessageText` on one
 * fails, so the group case must never fall through to it.
 */
async function rewrite(
  ctx: ReportContext,
  query: TelegramCallbackQuery,
  report: MatchReportRow,
  text: string,
  keyboard: Parameters<TelegramClient["editMessageText"]>[0]["reply_markup"],
): Promise<void> {
  const chat = query.message?.chat;

  if (chat?.type === "private") {
    const messageId = report.flow_message_id || query.message?.message_id;
    if (!messageId) return;
    await ctx.client.editMessageText({
      chat_id: chat.id,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    return;
  }

  const chatId = chat?.id ?? ctx.leagueChatId;
  // The message that was tapped comes first: it is the one on screen, and reports
  // handed out before the fix stored Telegram's placeholder 0 instead of a real id.
  const messageId = query.message?.ephemeral_message_id || report.flow_message_id;
  if (!chatId || !messageId) return;

  await ctx.client.editEphemeralMessageText({
    chat_id: chatId,
    receiver_user_id: query.from.id,
    ephemeral_message_id: messageId,
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

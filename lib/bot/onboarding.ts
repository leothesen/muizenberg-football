import { relativeKickoff } from "@/domain/schedule";
import { encodeCallback } from "@/lib/telegram/callbacks";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";
import { escapeHtml } from "./format";
import { identityButton } from "./identity";
import { rsvpKeyboard } from "./messages";

/**
 * The first thirty seconds.
 *
 * Somebody joins the Telegram group and is immediately a member of the league —
 * there is no form, no signup and nothing to accept. The welcome is sent as an
 * *ephemeral* message: it appears in the group but only the newcomer can see it, so
 * the chat is not filled with onboarding nobody else needs to read.
 */

export interface WelcomeParams {
  firstName: string;
  /** Null when there is no fixture on the horizon yet. */
  nextKickoffAt: Date | null;
  now: Date;
  /** Present once the bot has a Mini App to open. */
  miniAppUrl?: string;
  /** True while this week's night poll is taking votes — the buttons ride along. */
  nightPollOpen?: boolean;
}

/**
 * The line that introduces the night-poll buttons in a welcome.
 *
 * Five buttons reading Tuesday to Sunday mean nothing under a welcome message on their
 * own, and a newcomer may never see the poll they belong to. One sentence says what
 * they are and that tapping them counts.
 */
function nightPollLine(): string {
  return "🗓 <b>Which night this week?</b> The group is voting right now — tap every night you could play below.";
}

export function welcomeMessage(params: WelcomeParams): string {
  const name = escapeHtml(params.firstName);
  const lines: string[] = [];

  lines.push(`👋 <b>Welcome ${name}</b> — you're in the league.`);
  lines.push("");
  lines.push(
    "That's it. No signup, no password. You're on the list because you're in this chat.",
  );
  lines.push("");

  if (params.nightPollOpen) {
    lines.push(nightPollLine());
    lines.push("");
  }

  if (params.nextKickoffAt) {
    lines.push(
      `Next game is <b>${relativeKickoff(params.nextKickoffAt, params.now)}</b>. I'll ask the group who's keen the day before — tap ✅ and you're on the team sheet.`,
    );
  } else {
    lines.push(
      "I'll ask the group who's keen the day before each game. Tap ✅ and you're on the team sheet.",
    );
  }

  lines.push("");
  // No "start a chat with me" any more. It asked every newcomer to open a private chat
  // so the questionnaire could reach them, and almost nobody did — so on the first real
  // Wednesday it reached nobody. The questionnaire lives in the group now.
  lines.push(
    "Afterwards I'll ask how it went, right here — goals, nutmegs, the lot. It's all on trust.",
  );

  lines.push("");
  lines.push("<i>Only you can see this message.</i>");

  return lines.join("\n");
}

/**
 * The same welcome, shortened to sit under the picture.
 *
 * The long version has to explain the week in words because it is all there is. Once
 * the three panels are above it that explanation is duplicated, and a caption that
 * repeats the image is worse than a short one — so this keeps only the part the
 * picture cannot say, which is that the person reading it is already in.
 */
export function welcomeCaption(
  firstName: string,
  options: { nightPollOpen?: boolean } = {},
): string {
  const name = escapeHtml(firstName);

  return [
    `👋 <b>Welcome ${name}</b> — you're in the league.`,
    "",
    "No signup, no password. You're on the list because you're in this chat, and it's all on trust — nobody checks the goals.",
    "",
    // The picture explains the week in general; it cannot say a vote is running now.
    ...(options.nightPollOpen ? [nightPollLine(), ""] : []),
    "<i>Only you can see this message.</i>",
  ].join("\n");
}

export function welcomeKeyboard(params: {
  miniAppUrl?: string;
  /** The fixture currently taking answers, if there is one. */
  openFixtureId?: string;
  /** True once teams are picked, so the buttons say so instead of lying. */
  locked?: boolean;
  /**
   * This week's night-poll rows, while it is taking votes. The same buttons as the
   * poll, so a tap here is exactly a tap there.
   */
  nightPollRows?: InlineKeyboardMarkup["inline_keyboard"];
}): InlineKeyboardMarkup {
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];

  // The most important row, and the reason it is first: a newcomer cannot rely on
  // seeing the pinned poll. A supergroup set to hide history from new members hides
  // it completely, and even with history visible the poll may be hundreds of messages
  // back. Carrying the buttons here means somebody who joins on match-day morning can
  // answer for tonight without ever finding the original message.
  if (params.openFixtureId) {
    rows.push(
      rsvpKeyboard(params.openFixtureId, { locked: params.locked }).inline_keyboard[0]!,
    );
  }

  // Straight after, and for the same reason. Between Monday's poll and Tuesday's
  // booking there is no game to answer for yet — the vote is the only thing a
  // newcomer can do that week, and it is the poll they are least likely to have seen.
  if (params.nightPollRows) {
    rows.push(...params.nightPollRows);
  }

  if (params.miniAppUrl) {
    rows.push([{ text: "🏆 Open the league", web_app: { url: params.miniAppUrl } }]);
  }

  // Its own row, and before the other two: a newcomer's name on the sheet is whatever
  // their phone says, which is how the league ended up with two Liams. The one moment
  // somebody will fix that is the moment they are being told they are already in.
  rows.push([identityButton()]);

  rows.push([
    { text: "🃏 My card", callback_data: encodeCallback({ kind: "myCard" }) },
    { text: "📊 Table", callback_data: encodeCallback({ kind: "table" }) },
  ]);

  return { inline_keyboard: rows };
}

/** Shown when somebody who is already enrolled rejoins the group. */
export function welcomeBackMessage(firstName: string): string {
  return `👋 Welcome back, ${escapeHtml(firstName)}. Your record is exactly where you left it.`;
}

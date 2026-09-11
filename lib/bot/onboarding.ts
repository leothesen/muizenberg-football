import { relativeKickoff } from "@/domain/schedule";
import { encodeCallback } from "@/lib/telegram/callbacks";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";
import { escapeHtml } from "./format";

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
  /** Deep link that opens a private chat, so the bot can DM them later. */
  startDeepLink?: string;
  /** True when the bot has never had a private conversation with them. */
  needsPrivateChat: boolean;
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
  lines.push("Afterwards I'll ask how it went — goals, nutmegs, the lot. It's all on trust.");

  if (params.needsPrivateChat) {
    lines.push("");
    lines.push(
      "<i>One thing: start a chat with me so I can send you your post-match questions privately.</i>",
    );
  }

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
export function welcomeCaption(firstName: string): string {
  const name = escapeHtml(firstName);

  return [
    `👋 <b>Welcome ${name}</b> — you're in the league.`,
    "",
    "No signup, no password. You're on the list because you're in this chat, and it's all on trust — nobody checks the goals.",
    "",
    "<i>Only you can see this message.</i>",
  ].join("\n");
}

export function welcomeKeyboard(params: {
  miniAppUrl?: string;
  startDeepLink?: string;
  needsPrivateChat: boolean;
}): InlineKeyboardMarkup {
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];

  if (params.needsPrivateChat && params.startDeepLink) {
    rows.push([{ text: "💬 Say hello to the bot", url: params.startDeepLink }]);
  }

  if (params.miniAppUrl) {
    rows.push([{ text: "🏆 Open the league", web_app: { url: params.miniAppUrl } }]);
  }

  rows.push([
    { text: "🃏 My card", callback_data: encodeCallback({ kind: "myCard" }) },
    { text: "📊 Table", callback_data: encodeCallback({ kind: "table" }) },
  ]);

  return { inline_keyboard: rows };
}

/** Deep link that opens a private chat with the bot, carrying a payload. */
export function startDeepLink(botUsername: string, payload = "join"): string {
  return `https://t.me/${botUsername}?start=${payload}`;
}

/** Shown when somebody who is already enrolled rejoins the group. */
export function welcomeBackMessage(firstName: string): string {
  return `👋 Welcome back, ${escapeHtml(firstName)}. Your record is exactly where you left it.`;
}

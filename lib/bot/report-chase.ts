import { escapeHtml } from "./format";
import { startDeepLink } from "./onboarding";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";

/**
 * Reaching somebody the bot is not allowed to message.
 *
 * A Telegram bot cannot open a conversation. It may only reply inside a private chat
 * the person started, which is why `players.private_chat_id` exists at all: it is
 * null until somebody has said something to the bot directly, and while it is null
 * there is no DM to send. The post-match questionnaire is a DM, so for months anyone
 * who had never messaged the bot was dropped from it in a single silent line —
 * `if (!player?.private_chat_id) return null` — and on a night where that was most of
 * the squad, the morning after reported no agreed score and blamed the players.
 *
 * Nothing in code can lift the restriction. What it can do is stop losing them
 * quietly: say so in the group, where they will see it, and give them the two things
 * that actually work — a deep link that starts the private chat, and the Mini App,
 * which needs no private chat at all.
 *
 * Ephemeral, like the welcome and the RSVP acknowledgement: it appears in the group
 * but only to the person it names. Nobody else needs to watch somebody be chased.
 */

export const REPORT_START_PAYLOAD = "report";

export function chaseMessage(firstName: string): string {
  return [
    `📋 <b>${escapeHtml(firstName)}</b> — how did it go?`,
    "",
    "Your questions are ready: goals, assists, nutmegs, the lot. I can't send them to " +
      "you privately until you've messaged me once — that's Telegram's rule, not mine.",
    "",
    "Tap below and they arrive straight away.",
    "",
    "<i>Only you can see this message.</i>",
  ].join("\n");
}

/**
 * Two ways in, and the private chat first.
 *
 * The deep link is the one worth taking, because it fixes the problem rather than
 * routing around it once: after it, every future questionnaire arrives on its own.
 * The Mini App is there for anyone who would rather not, and for the night itself —
 * it opens on whatever they still owe.
 *
 * The web_app button rides in a group message exactly as the welcome's does. If
 * Telegram ever refuses one there, the deep link above it still works.
 */
export function chaseKeyboard(params: {
  botUsername?: string;
  miniAppUrl?: string;
}): InlineKeyboardMarkup | undefined {
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];

  if (params.botUsername) {
    rows.push([
      {
        text: "💬 Send me my questions",
        url: startDeepLink(params.botUsername, REPORT_START_PAYLOAD),
      },
    ]);
  }

  if (params.miniAppUrl) {
    rows.push([
      { text: "📋 Or fill it in here", web_app: { url: params.miniAppUrl } },
    ]);
  }

  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}

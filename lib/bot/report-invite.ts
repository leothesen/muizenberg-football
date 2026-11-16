import { describeKickoff } from "@/domain/schedule";
import { encodeCallback } from "@/lib/telegram/callbacks";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";
import { escapeHtml, sentenceList } from "./format";

/**
 * The one message the group gets after a game.
 *
 * The questionnaire used to be a DM, and a bot may not open a DM: it can only reply in
 * a private chat somebody else started. On the first real Wednesday nobody on the team
 * sheet had ever messaged the bot, so nobody was asked, and the morning after reported
 * "no agreed score" as though the squad had not bothered.
 *
 * So it happens in the group instead. One public message names everyone who played
 * and carries one button; each person who taps it gets their own questionnaire as a
 * message only they can see. Nothing depends on a private chat existing.
 *
 * A tap rather than nine pushed questionnaires, deliberately. A message only one person
 * can see is not guaranteed to reach them if they are offline when it is sent (see
 * docs/TELEGRAM_API.md), and a questionnaire pushed at 18:30 is exactly that for
 * anybody still in the car. Somebody tapping a button is online by definition.
 */

export interface InvitedPlayer {
  telegramUserId: number;
  displayName: string;
}

/**
 * A mention that notifies, including people who have muted the group.
 *
 * By id rather than by @username, because most of the group has no username set.
 * Telegram only honours these for people in the chat, which everyone who played is.
 */
function mention(player: InvitedPlayer): string {
  return `<a href="tg://user?id=${player.telegramUserId}">${escapeHtml(player.displayName)}</a>`;
}

/**
 * Leads with the score, as a question.
 *
 * "How did it go?" read like small talk, and "log your stats" like homework. The score
 * is the thing everybody who played wants settled and can answer without thinking —
 * so it is the headline, it is the first question the button opens, and the rest
 * follows once they are already tapping.
 */
export function reportInviteMessage(params: {
  kickoffAt: Date;
  teams: { a: string; b: string };
  players: InvitedPlayer[];
}): string {
  return [
    `⚽ <b>What was the score?</b>`,
    `${escapeHtml(params.teams.a)} v ${escapeHtml(params.teams.b)} · ` +
      escapeHtml(describeKickoff(params.kickoffAt)),
    "",
    `${sentenceList(params.players.map(mention))} — tap below for the score and your ` +
      "man-of-the-match vote. Three taps, and only you see them.",
    "",
    "<i>Results go up at 11 tomorrow, from whatever's in.</i>",
  ].join("\n");
}

export function reportInviteKeyboard(fixtureId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "⚽ Score & man of the match",
          callback_data: encodeCallback({ kind: "reportStart", fixtureId }),
        },
      ],
    ],
  };
}

/**
 * The private nudge for somebody on the sheet who has not filed: once at 21:00 on the
 * night, and a last call at 08:30 the next morning. It carries the same button as the
 * group post, which in a private chat opens the questionnaire right there.
 *
 * Only reaches people who have opened a chat with the bot at some point — Telegram
 * lets a bot reply in a private chat, never start one — so the group post stays the
 * main ask and this is the extra push for whoever it can reach.
 */
export function reportReminderMessage(params: {
  kickoffAt: Date;
  teams: { a: string; b: string };
  lastCall: boolean;
}): string {
  const game =
    `${escapeHtml(params.teams.a)} v ${escapeHtml(params.teams.b)} · ` +
    escapeHtml(describeKickoff(params.kickoffAt));

  return params.lastCall
    ? [
        `⏰ <b>Last call: what was the score?</b>`,
        game,
        "",
        "Results go up at 11:00 today. Three taps: the score and your man-of-the-match vote.",
      ].join("\n")
    : [
        `⚽ <b>What was the score tonight?</b>`,
        game,
        "",
        "It's three taps: the score and your man-of-the-match vote. Results go up at 11:00 tomorrow.",
      ].join("\n");
}

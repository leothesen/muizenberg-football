import {
  WEEKEND_THRESHOLD,
  resolveNights,
  type NightOutcome,
  type NightTally,
} from "@/domain/nights";
import { describeKickoff } from "@/domain/schedule";
import { encodeCallback } from "@/lib/telegram/callbacks";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";
import { bold, escapeHtml, plural } from "./format";

/**
 * Monday's poll: which night this week.
 *
 * An inline keyboard rather than a native Telegram poll, for three reasons that all
 * matter more than familiarity. A native poll's results arrive as a separate update
 * type that has to be named in setWebhook's allowed_updates — the exact trap that has
 * already cost this project once with chat_member, and one that fails silently. A
 * native poll cannot show the group what its own answer *means*, and "Wednesday it is
 * so far" is the useful half of the message. And the RSVP flow already works this way,
 * so a player learns one interaction rather than two.
 *
 * The counts sit on the buttons, which is what makes it feel like a poll: you tap a
 * night, the number goes up, and the line underneath tells you where that leaves the
 * week.
 */

export function nightPollKeyboard(tally: NightTally[]): InlineKeyboardMarkup {
  return {
    inline_keyboard: tally.map((entry) => [
      {
        text: entry.votes > 0 ? `${entry.option.label}  ·  ${entry.votes}` : entry.option.label,
        callback_data: encodeCallback({ kind: "night", night: entry.option.key }),
      },
    ]),
  };
}

export function nightPollMessage(outcome: NightOutcome): string {
  const lines = [
    `🗓 ${bold("Which night this week?")}`,
    "",
    "Tap every night you could play. More than one is fine — most people can do two.",
    "",
  ];

  lines.push(leadLine(outcome));

  const weekendVotes = outcome.tally
    .filter((entry) => entry.option.weekend)
    .reduce((sum, entry) => sum + entry.votes, 0);

  if (!outcome.weekend && weekendVotes > 0) {
    const needed = WEEKEND_THRESHOLD - Math.max(...weekendOnly(outcome).map((e) => e.votes));
    lines.push(
      `<i>${plural(needed, "more vote", "more votes")} on a Saturday or Sunday and there's a weekend game too.</i>`,
    );
  }

  if (outcome.weekend) {
    lines.push(
      `<i>Plus a ${escapeHtml(outcome.weekend.label)} game — enough people want one.</i>`,
    );
  }

  return lines.join("\n");
}

function weekendOnly(outcome: NightOutcome): NightTally[] {
  return outcome.tally.filter((entry) => entry.option.weekend);
}

function leadLine(outcome: NightOutcome): string {
  if (outcome.byDefault) {
    // Never "no votes yet, the game may not happen". The default is that it does, and
    // saying so is what stops a quiet Monday from becoming a dead week.
    return `Nothing yet, so it's ${bold(outcome.weeknight.label)} as usual. Change that below.`;
  }

  const leader = outcome.tally.find((entry) => entry.option.key === outcome.weeknight.key);
  return `${bold(outcome.weeknight.label)} is winning with ${plural(leader?.votes ?? 0, "vote", "votes")}.`;
}

/**
 * What the group is told once the votes have been read.
 *
 * Announced rather than silently acted on: somebody who voted for Thursday and got a
 * Wednesday needs to see that the vote was counted and lost, not wonder whether their
 * tap registered.
 */
export function nightsResolvedMessage(params: {
  outcome: NightOutcome;
  weeknightKickoff: Date;
  weekendKickoff: Date | null;
}): string {
  const lines = [`⚽ ${bold("We're on")}`, ""];

  lines.push(`${bold(describeKickoff(params.weeknightKickoff))} at Zandvlei.`);

  if (params.outcome.byDefault) {
    lines.push("");
    lines.push("<i>Nobody voted, so it's the usual night. Still on.</i>");
  } else {
    const votes = params.outcome.tally.find(
      (entry) => entry.option.key === params.outcome.weeknight.key,
    )?.votes;
    lines.push("");
    lines.push(`<i>${plural(votes ?? 0, "vote", "votes")} for it. Poll's closed.</i>`);
  }

  if (params.weekendKickoff && params.outcome.weekend) {
    lines.push("");
    lines.push(`🎉 ${bold("And a weekend one")}`);
    lines.push(`${describeKickoff(params.weekendKickoff)}.`);
  }

  return lines.join("\n");
}

/** The private reply to somebody who just tapped a night. */
export function nightVoteAcknowledgement(params: {
  night: string;
  voted: boolean;
  votes: readonly { night: string }[];
}): string {
  const outcome = resolveNights(params.votes);

  if (!params.voted) {
    return `Took ${params.night} back. ${outcome.weeknight.label} is ahead.`;
  }

  return `${params.night} it is. ${outcome.weeknight.label} is ahead so far.`;
}

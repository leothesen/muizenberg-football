import {
  WEEKEND_THRESHOLD,
  resolveNights,
  type NightOutcome,
  type NightTally,
} from "@/domain/nights";
import {
  TIME_CHANGE_THRESHOLD,
  type TimeOutcome,
  type TimeTally,
  type TimeVote,
} from "@/domain/kickoff-times";
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

export function nightPollKeyboard(
  tally: NightTally[],
  times: TimeTally[] = [],
): InlineKeyboardMarkup {
  const nights = tally.map((entry) => [
    {
      text: entry.votes > 0 ? `${entry.option.label}  ·  ${entry.votes}` : entry.option.label,
      callback_data: encodeCallback({ kind: "night", night: entry.option.key }),
    },
  ]);

  // Two to a row. Four across leaves "18:30 · 12" truncated on a phone, and a pair of
  // times under a column of nights still reads as a different question. No row at all
  // when 17:30 is the only thing on offer: a question with one answer is not one.
  const timeButtons =
    times.length > 1
      ? times.map((entry) => ({
          text: `⏰ ${entry.votes > 0 ? `${entry.option.label}  ·  ${entry.votes}` : entry.option.label}`,
          callback_data: encodeCallback({ kind: "time", time: entry.option.key }),
        }))
      : [];
  const timeRows = [];
  for (let i = 0; i < timeButtons.length; i += 2) timeRows.push(timeButtons.slice(i, i + 2));

  return { inline_keyboard: [...nights, ...timeRows] };
}

export function nightPollMessage(outcome: NightOutcome, time?: TimeVote): string {
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

  if (time) {
    lines.push("");
    lines.push(...timeLines(time));
  }

  return lines.join("\n");
}

/**
 * The time half of the poll.
 *
 * Says what happens if nobody taps anything, because that is what happens most weeks,
 * and what it takes to change it — "tap a time" with no threshold in sight reads as
 * "one tap moves the game", which it does not.
 */
function timeLines({ outcome, sunset }: TimeVote): string[] {
  if (outcome.tally.length <= 1) {
    return [
      `⏰ ${bold(outcome.time.label)} kickoff. <i>Sunset's ${sunset}, too early for anything later.</i>`,
    ];
  }

  if (!outcome.byDefault) {
    const votes = outcome.tally.find((entry) => entry.option.key === outcome.time.key)?.votes ?? 0;
    return [
      `⏰ ${bold(outcome.time.label)} kickoff is winning with ${plural(votes, "vote", "votes")}.`,
      `<i>Sunset's ${sunset}. Tap every time you could make.</i>`,
    ];
  }

  return [
    `⏰ ${bold(outcome.time.label)} kickoff as usual. Rather start later? Tap every time you could make — ${TIME_CHANGE_THRESHOLD} votes moves it.`,
    `<i>Sunset's ${sunset}, so only times that finish in the light.</i>`,
  ];
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
  time?: TimeOutcome;
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

  // Its own line, because a kickoff that is not the usual one is the detail people
  // will get wrong: everybody's habit says 17:30.
  const time = params.time;
  if (time && !time.byDefault) {
    const votes = time.tally.find((entry) => entry.option.key === time.time.key)?.votes ?? 0;
    lines.push(
      `⏰ ${bold(`${time.time.label} kickoff`)}, not the usual — ${plural(votes, "vote", "votes")} for it.`,
    );
  }

  if (params.weekendKickoff && params.outcome.weekend) {
    lines.push("");
    lines.push(`🎉 ${bold("And a weekend one")}`);
    lines.push(`${describeKickoff(params.weekendKickoff)}.`);
  }

  return lines.join("\n");
}

/**
 * What the poll itself turns into once the week is booked.
 *
 * Tuesday's booking used to leave the poll exactly as it was, buttons and all. Late
 * taps went on being stored and went on rewriting "Thursday is winning" into a poll
 * whose week was already booked for Wednesday — a count that no longer decided
 * anything, still dressed as one that did. The booking now rewrites the poll into
 * this, with no keyboard, so there is nothing left to tap.
 *
 * The final count stays, because the buttons that carried it are gone and somebody
 * scrolling back should still be able to see how it went.
 */
export function nightPollClosedMessage(params: {
  outcome: NightOutcome;
  weeknightKickoff: Date;
  weekendKickoff: Date | null;
  time?: TimeOutcome;
}): string {
  const booked = [describeKickoff(params.weeknightKickoff)];
  if (params.weekendKickoff && params.outcome.weekend) {
    booked.push(describeKickoff(params.weekendKickoff));
  }

  const lines = [
    `🗓 ${bold("Which night this week?")}`,
    "",
    `${bold("Poll's closed.")} It's ${booked.map((when) => bold(when)).join(" and ")}.`,
    "",
  ];

  const counted = params.outcome.tally
    .filter((entry) => entry.votes > 0)
    .sort((a, b) => b.votes - a.votes);

  lines.push(
    counted.length === 0
      ? "<i>Nobody voted, so it's the usual night.</i>"
      : `<i>Final count: ${counted
          .map((entry) => `${escapeHtml(entry.option.label)} ${entry.votes}`)
          .join(" · ")}</i>`,
  );

  const times = (params.time?.tally ?? []).filter((entry) => entry.votes > 0);
  if (times.length > 0) {
    lines.push(
      `<i>Times: ${times.map((entry) => `${entry.option.label} ${entry.votes}`).join(" · ")}</i>`,
    );
  }

  return lines.join("\n");
}

/**
 * The answer to somebody tapping a poll that has already been decided.
 *
 * Said rather than silently ignored: a button that does nothing looks broken, and one
 * that still moves the count looks like it still matters.
 */
export function nightVoteRefusal(): string {
  return "That poll's closed — this week's night is already booked.";
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

/** The private reply to somebody who just tapped a time. */
export function timeVoteAcknowledgement(params: {
  time: string;
  voted: boolean;
  outcome: TimeOutcome;
}): string {
  const standing = params.outcome.byDefault
    ? `Still ${params.outcome.time.label} unless ${TIME_CHANGE_THRESHOLD} people want a later one.`
    : `${params.outcome.time.label} is ahead.`;

  return params.voted
    ? `${params.time} works for you. ${standing}`
    : `Took ${params.time} back. ${standing}`;
}

/** A time tapped after sunset has ruled it out — usually because the winning night changed. */
export function timeVoteTooDark(sunset: string): string {
  return `Too dark by the end of that one — sunset's ${sunset}.`;
}

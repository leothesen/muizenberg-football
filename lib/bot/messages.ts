import { describeKickoff, relativeKickoff } from "@/domain/schedule";
import { squadHealth, splitSquad } from "@/domain/squad";
import type { Commitment, SquadShape } from "@/domain/types";
import { encodeCallback } from "@/lib/telegram/callbacks";
import type { InlineKeyboardButton, InlineKeyboardMarkup } from "@/lib/telegram/types";
import { bold, escapeHtml, playerLabel, plural } from "./format";

/**
 * Everything the group actually reads.
 *
 * Kept separate from the handlers so the wording can be tested without a database or
 * a network, and so somebody can change the tone of the league without going near the
 * plumbing.
 */

export interface FixtureLike {
  id: string;
  kickoffAt: Date;
  venue: string;
  rsvpClosesAt: Date | null;
  shape: SquadShape;
}

export interface RsvpBreakdown {
  commitments: Commitment[];
  maybes: { displayName: string; emoji: string }[];
  outs: { displayName: string; emoji: string }[];
}

/** The message that goes out on Tuesday and then edits itself all day. */
export function squadMessage(
  fixture: FixtureLike,
  breakdown: RsvpBreakdown,
  now: Date,
): string {
  const { playing, waitlisted } = splitSquad(breakdown.commitments, fixture.shape);
  const health = squadHealth(breakdown.commitments, fixture.shape);

  const lines: string[] = [];

  lines.push(`⚽ ${bold("Football " + relativeKickoff(fixture.kickoffAt, now))}`);
  lines.push(`${describeKickoff(fixture.kickoffAt)} · ${escapeHtml(fixture.venue)}`);
  lines.push("");

  lines.push(bold(`IN — ${playing.length}/${health.capacity}`));
  if (playing.length === 0) {
    lines.push("<i>Nobody yet. Someone has to go first.</i>");
  } else {
    playing.forEach((c, i) => {
      lines.push(`${i + 1}. ${playerLabel(c.player)}`);
    });
  }

  if (waitlisted.length > 0) {
    lines.push("");
    lines.push(bold(`WAITING — ${waitlisted.length}`));
    waitlisted.forEach((c, i) => {
      lines.push(`${i + 1}. ${playerLabel(c.player)}`);
    });
  }

  if (breakdown.maybes.length > 0) {
    lines.push("");
    lines.push(bold(`MAYBE — ${breakdown.maybes.length}`));
    lines.push(breakdown.maybes.map(playerLabel).join("  "));
  }

  if (breakdown.outs.length > 0) {
    lines.push("");
    lines.push(bold(`OUT — ${breakdown.outs.length}`));
    lines.push(breakdown.outs.map(playerLabel).join("  "));
  }

  lines.push("");
  lines.push(statusLine(health, fixture, now));

  return lines.join("\n");
}

function statusLine(
  health: ReturnType<typeof squadHealth>,
  fixture: FixtureLike,
  now: Date,
): string {
  const closes = fixture.rsvpClosesAt
    ? ` Answers close ${relativeKickoff(fixture.rsvpClosesAt, now)} at ${timeOnly(fixture.rsvpClosesAt)}.`
    : "";

  if (health.full) {
    return `🔒 Full. Anyone else joins the waiting list — and people always drop out.${closes}`;
  }
  if (!health.viable) {
    return `⚠️ ${plural(health.shortBy, "more player")} needed or this is off.${closes}`;
  }
  return `✅ Game is on. Room for ${plural(health.spotsLeft, "more")}.${closes}`;
}

function timeOnly(date: Date): string {
  return describeKickoff(date).split(", ")[1] ?? "";
}

/**
 * The poll's buttons.
 *
 * When the game is full the "I'm in" button is `disabled` rather than removed. A
 * button that vanishes reads as a bug; a greyed-out one reads as a full game — and
 * "Join the waitlist" says exactly what tapping would do instead, which is the honest
 * version of what used to happen silently.
 */
export function rsvpKeyboard(
  fixtureId: string,
  options: { full?: boolean; locked?: boolean } = {},
): InlineKeyboardMarkup {
  const inButton = options.locked
    ? { text: "🔒 Teams are picked", disabled: {} as Record<string, never> }
    : {
        text: options.full ? "⏳ Join the waitlist" : "✅ I'm in",
        callback_data: encodeCallback({ kind: "rsvp", status: "in", fixtureId }),
      };

  return {
    inline_keyboard: [
      [
        inButton,
        { text: "❌ Can't", callback_data: encodeCallback({ kind: "rsvp", status: "out", fixtureId }) },
        { text: "🤔 Maybe", callback_data: encodeCallback({ kind: "rsvp", status: "maybe", fixtureId }) },
      ],
      [
        { text: "🃏 My card", callback_data: encodeCallback({ kind: "myCard" }) },
        { text: "📊 Table", callback_data: encodeCallback({ kind: "table" }) },
      ],
    ],
  };
}

/**
 * Puts the league table into a chat of the tapper's choosing, via inline mode. The
 * chat filters exclude channels and other bots, where a league table is just noise.
 */
export function shareButton(text = "↗️ Share the table"): InlineKeyboardButton {
  return {
    text,
    switch_inline_query_chosen_chat: {
      query: "table",
      allow_user_chats: true,
      allow_group_chats: true,
      allow_bot_chats: false,
      allow_channel_chats: false,
    },
  };
}

/** Telegram's documented cap on `CopyTextButton.text`. */
export const COPY_TEXT_MAX = 256;

/**
 * Hands out the venue as something tappable rather than something to retype.
 *
 * The clamp is not theoretical: `venue` is an unbounded text column, and a value over
 * the limit would make Telegram reject the entire message rather than just trimming
 * the button.
 */
export function copyVenueButton(venue: string): InlineKeyboardButton {
  // No escaping: a button label is plain text, so escaping would show "&amp;".
  const text = venue.slice(0, COPY_TEXT_MAX);
  return { text: `📍 Copy "${text}"`, copy_text: { text } };
}

/**
 * The private reply to somebody who just tapped a button. Only they see this, so it
 * can be specific about their own position without cluttering the chat.
 */
export function rsvpAcknowledgement(params: {
  displayName: string;
  status: "in" | "out" | "maybe";
  position: number | null;
  waitlisted: boolean;
  spotsLeft: number;
}): string {
  const name = escapeHtml(params.displayName);

  if (params.status === "out") {
    return `No worries ${name} — you're down as out. If you change your mind, just tap "I'm in".`;
  }
  if (params.status === "maybe") {
    return `Noted, ${name}. A maybe is better than silence, but the sooner you decide the better your spot.`;
  }
  if (params.waitlisted) {
    return `You're on the waiting list, ${name} — number ${params.position} in the queue. People drop out most weeks, so keep your evening free.`;
  }
  return `You're in, ${name} — number ${params.position} on the sheet. ${
    params.spotsLeft > 0 ? `${plural(params.spotsLeft, "spot")} left.` : "That's a full house."
  }`;
}

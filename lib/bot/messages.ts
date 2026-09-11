import { describeKickoff, relativeKickoff } from "@/domain/schedule";
import { formatFor } from "@/domain/formats";
import { squadHealth, splitSquad } from "@/domain/squad";
import type { Commitment, SquadShape } from "@/domain/types";
import type { Venue } from "@/domain/venues";
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
  lines.push(statusLine(health, fixture, now, fixture.shape));

  return lines.join("\n");
}

function statusLine(
  health: ReturnType<typeof squadHealth>,
  fixture: FixtureLike,
  now: Date,
  shape: SquadShape,
): string {
  const closes = fixture.rsvpClosesAt
    ? ` Answers close ${relativeKickoff(fixture.rsvpClosesAt, now)} at ${timeOnly(fixture.rsvpClosesAt)}.`
    : "";

  if (health.full) {
    return `🔒 Full. Anyone else joins the waiting list — and people always drop out.${closes}`;
  }

  // Below the league's own minimum the game is still on, just smaller. Saying "or
  // this is off" was both untrue and the wrong kind of pressure: it taught people
  // that answering a poll might buy them nothing.
  if (!health.viable) {
    const format = formatFor(health.confirmed, shape);

    if (!format.playable) {
      return `⏳ Nobody's committed yet. It only takes two.${closes}`;
    }
    return `✅ On as ${format.label} with ${plural(health.confirmed, "player")}. More makes it bigger.${closes}`;
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
 * The venue as one tappable thing.
 *
 * A pinned venue becomes a link straight into the maps app, which is what somebody
 * standing outside their car actually wants. Copying the name to the clipboard was
 * only ever a workaround for not knowing where the place was, so it stays as the
 * fallback for a venue nobody has pinned rather than as the default.
 */
export function venueButton(venue: Venue): InlineKeyboardButton {
  if (venue.mapsUrl) {
    return { text: `📍 ${venue.name.slice(0, COPY_TEXT_MAX)}`, url: venue.mapsUrl };
  }
  return copyVenueButton(venue.name);
}

/**
 * Somebody has put a game on the books.
 *
 * Reads as an invitation rather than an announcement, because that is what it is: no
 * vote decided this and nobody was consulted, so the message has to make it obvious
 * who to argue with. The assumed time is called out for the same reason — somebody
 * who typed "saturday" and meant the morning needs to see 17:00 before ten people
 * have already answered it.
 */
export function gameCalledMessage(params: {
  calledBy: string;
  kickoffAt: Date;
  venue: Venue;
  assumedTime: boolean;
}): string {
  const lines = [
    `⚽ ${bold("Game on")}`,
    "",
    `${bold(describeKickoff(params.kickoffAt))} at ${escapeHtml(params.venue.name)}.`,
    "",
    `<i>${escapeHtml(params.calledBy)} called it. Anyone can.</i>`,
  ];

  if (params.assumedTime) {
    lines.push(`<i>No time given, so that's the usual one — /game again to change it.</i>`);
  }

  return lines.join("\n");
}

/** What to say when the time somebody typed could not be read. */
export function gameHelpMessage(attempted: string): string {
  const lines = attempted
    ? [`I couldn't read <b>${escapeHtml(attempted)}</b> as a day and time.`, ""]
    : ["Tell me when, and I'll put it on the books.", ""];

  lines.push("<b>/game saturday</b>");
  lines.push("<b>/game sat 4pm</b>");
  lines.push("<b>/game tomorrow 6pm</b>");
  lines.push("<b>/game thursday 18:30</b>");

  return lines.join("\n");
}

/**
 * Somebody thinks it's off.
 *
 * Phrased as a question the group answers, never as an announcement. One person
 * cannot call a game off here — they can only go out themselves and say why, and the
 * count decides. So this has to read as "here is the situation" rather than "it's
 * cancelled", or people will stop reading the number and start reading the headline.
 */
export function doubtMessage(params: {
  raisedBy: string;
  reason: string;
  confirmed: number;
  kickoffAt: Date;
}): string {
  const lines = [`🌧 ${bold("Is this still on?")}`, ""];

  lines.push(
    params.reason
      ? `${escapeHtml(params.raisedBy)} is out — ${escapeHtml(params.reason)}.`
      : `${escapeHtml(params.raisedBy)} is out.`,
  );

  lines.push("");
  lines.push(
    params.confirmed > 0
      ? `${plural(params.confirmed, "person", "people")} still in for ${describeKickoff(params.kickoffAt)}.`
      : `Nobody left in for ${describeKickoff(params.kickoffAt)}.`,
  );

  lines.push("");
  lines.push("<i>Your call. Nobody decides this for anybody else.</i>");

  return lines.join("\n");
}

/**
 * The evening ended because everybody went home.
 *
 * The only message in the bot that admits a game is not happening, and it is
 * deliberately about people rather than about numbers: "called off" is a decision
 * somebody made, and this was not one. Nothing here suggests anyone should have
 * answered differently, because the next poll depends on them answering at all.
 */
export function abandonedMessage(params: { kickoffAt: Date; reason: string }): string {
  const lines = [`🚫 ${bold("Not tonight")}`, ""];

  lines.push(
    params.reason
      ? `${describeKickoff(params.kickoffAt)} is off — ${escapeHtml(params.reason)}.`
      : `${describeKickoff(params.kickoffAt)} is off. Everybody dropped out.`,
  );

  lines.push("");
  lines.push("<i>Next week as usual. The poll goes up Monday.</i>");

  return lines.join("\n");
}

/** The answer to a bare "/where". */
export function venueMessage(venue: Venue, kickoffAt: Date): string {
  const lines = [
    `📍 ${bold(escapeHtml(venue.name))}`,
    `${describeKickoff(kickoffAt)}`,
  ];

  if (!venue.mapsUrl) {
    // Said out loud, because a venue with no pin is the one case where somebody still
    // has to ask a human, and they should know that before they set off.
    lines.push("");
    lines.push("<i>No pin on this one. Send /where with a maps link to add one.</i>");
  }

  return lines.join("\n");
}

/**
 * The group's record that somebody moved the game.
 *
 * Names whoever moved it. Not for blame — so that the one person who knows it is
 * wrong knows who to talk to, and so that a mis-tap is obvious rather than silent.
 */
export function venueChangedMessage(params: {
  venue: Venue;
  kickoffAt: Date;
  movedBy: string;
}): string {
  const lines = [
    `📍 ${bold("Change of venue")}`,
    "",
    `${describeKickoff(params.kickoffAt)} is now at ${bold(escapeHtml(params.venue.name))}.`,
  ];

  if (!params.venue.mapsUrl) {
    lines.push("");
    lines.push("<i>No pin on that one — send a maps link if you have one.</i>");
  }

  lines.push("");
  lines.push(`<i>Moved by ${escapeHtml(params.movedBy)}. Anyone can move it back.</i>`);

  return lines.join("\n");
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

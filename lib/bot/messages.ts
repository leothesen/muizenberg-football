import { describeKickoff, relativeKickoff } from "@/domain/schedule";
import { squadHealth, splitSquad } from "@/domain/squad";
import type { Commitment, SquadShape } from "@/domain/types";
import { encodeCallback } from "@/lib/telegram/callbacks";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";
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

/** The In / Out / Maybe buttons, plus a way to see your own card. */
export function rsvpKeyboard(fixtureId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ I'm in", callback_data: encodeCallback({ kind: "rsvp", status: "in", fixtureId }) },
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

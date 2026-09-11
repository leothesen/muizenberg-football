import type { Venue } from "@/domain/venues";

/**
 * The fixture as a calendar entry.
 *
 * Served as a file rather than sent as one. A hosted .ics behind a button works for
 * everybody — including the people who have never opened a private chat with the bot,
 * who are exactly the newcomers most likely to want it — and it can be tapped twice
 * without producing two of anything.
 *
 * The part that has to be right is UID and SEQUENCE. The match night is now the
 * group's to change, so a calendar entry that could not be revised in place would
 * leave everybody with a stale Wednesday alongside the real Thursday, and the app
 * that was meant to reduce confusion would be manufacturing it.
 */

export interface CalendarEvent {
  fixtureId: string;
  kickoffAt: Date;
  venue: Venue;
  /** When the fixture last changed. Drives SEQUENCE and DTSTAMP. */
  updatedAt: Date;
  /** How long a game runs, for the end time. */
  durationMinutes?: number;
  cancelled?: boolean;
}

const DEFAULT_DURATION_MINUTES = 90;

/** The epoch SEQUENCE counts from, so the number stays a comfortable integer. */
const SEQUENCE_EPOCH = Date.UTC(2020, 0, 1) / 1000;

function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * RFC 5545 escaping: backslash, semicolon, comma and newline carry meaning inside a
 * property value. A venue called "Dave's field, behind the shop" would otherwise
 * silently split into two properties and the entry would lose its location.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to 75 octets, as the spec requires.
 *
 * Not cosmetic: strict parsers reject a long line outright, and the ones that do not
 * often truncate it — which would drop the end of a venue name or a URL with no error
 * anywhere. Counted in bytes rather than characters, because an emoji in a venue name
 * is four octets and a naive 75-character fold would produce an over-long line.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;

  while (start < bytes.length) {
    // 75 on the first line, 74 on the rest — a continuation costs one octet for the
    // leading space.
    const limit = parts.length === 0 ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);

    // Never split a multi-byte character: continuation octets are 0b10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end -= 1;
    }

    const chunk = new TextDecoder().decode(bytes.slice(start, end));
    parts.push(parts.length === 0 ? chunk : ` ${chunk}`);
    start = end;
  }

  return parts.join("\r\n");
}

export function fixtureCalendar(event: CalendarEvent): string {
  const duration = event.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const end = new Date(event.kickoffAt.getTime() + duration * 60_000);

  // Stable for the life of the fixture, so a changed night revises the entry somebody
  // already saved rather than adding a second one beside it.
  const uid = `fixture-${event.fixtureId}@muizenberg-football`;

  // Must increase on every revision or clients ignore the update. Seconds since 2020
  // is monotonic, needs no column, and cannot go backwards.
  const sequence = Math.max(
    0,
    Math.floor(event.updatedAt.getTime() / 1000 - SEQUENCE_EPOCH),
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Muizenberg Football//EN",
    "CALSCALE:GREGORIAN",
    // REQUEST rather than PUBLISH: PUBLISH is a feed, and a client reading it has no
    // reason to revise an entry it already holds.
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${stamp(event.updatedAt)}`,
    `DTSTART:${stamp(event.kickoffAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(event.cancelled ? "Football (off)" : "Football")}`,
    `LOCATION:${escapeText(event.venue.name)}`,
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
  ];

  if (event.venue.lat !== null && event.venue.lon !== null) {
    // Semicolon-separated and unescaped — GEO is a structured value, not text, and
    // escaping the separator would make it unparseable.
    lines.push(`GEO:${event.venue.lat};${event.venue.lon}`);
  }

  if (event.venue.mapsUrl) {
    lines.push(`URL:${escapeText(event.venue.mapsUrl)}`);
    lines.push(`DESCRIPTION:${escapeText(`Directions: ${event.venue.mapsUrl}`)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  // CRLF throughout, which the spec requires and several clients enforce.
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

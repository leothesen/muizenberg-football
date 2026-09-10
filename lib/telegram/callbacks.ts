import type { RsvpStatus } from "@/domain/types";

/**
 * Callback data codec.
 *
 * Telegram allows a hard maximum of 64 **bytes** in `callback_data`, and silently
 * rejects the whole keyboard if any button exceeds it. A UUID alone is 36 characters,
 * so the action codes are single letters and the encoder refuses to build anything
 * too long rather than letting it fail at send time.
 */

export const CALLBACK_DATA_MAX_BYTES = 64;

export type CallbackAction =
  | { kind: "rsvp"; status: RsvpStatus; fixtureId: string }
  | { kind: "squad"; fixtureId: string }
  | { kind: "myCard" }
  | { kind: "table" }
  | { kind: "help" }
  | { kind: "report"; fixtureId: string; field: ReportField; value: number }
  // No fixtureId: two UUIDs plus separators is 75 bytes, over the 64-byte limit.
  // The fixture is derived from the voter's one outstanding report instead.
  | { kind: "reportMotm"; playerId: string }
  | { kind: "reportSkip"; fixtureId: string }
  | { kind: "noop" };

export type ReportField = "goals" | "assists" | "nutmegs" | "tackles" | "saves" | "rating";

const RSVP_CODES: Record<RsvpStatus, string> = { in: "i", out: "o", maybe: "m" };
const RSVP_BY_CODE: Record<string, RsvpStatus> = { i: "in", o: "out", m: "maybe" };

const FIELD_CODES: Record<ReportField, string> = {
  goals: "g",
  assists: "a",
  nutmegs: "n",
  tackles: "t",
  saves: "s",
  rating: "r",
};
const FIELD_BY_CODE: Record<string, ReportField> = Object.fromEntries(
  Object.entries(FIELD_CODES).map(([k, v]) => [v, k as ReportField]),
);

export function encodeCallback(action: CallbackAction): string {
  const encoded = build(action);
  const bytes = new TextEncoder().encode(encoded).length;

  if (bytes > CALLBACK_DATA_MAX_BYTES) {
    throw new Error(
      `callback_data is ${bytes} bytes, over Telegram's ${CALLBACK_DATA_MAX_BYTES}-byte limit: ${encoded}`,
    );
  }
  return encoded;
}

function build(action: CallbackAction): string {
  switch (action.kind) {
    case "rsvp":
      return `r:${RSVP_CODES[action.status]}:${action.fixtureId}`;
    case "squad":
      return `q:${action.fixtureId}`;
    case "myCard":
      return "c";
    case "table":
      return "t";
    case "help":
      return "h";
    case "report":
      return `p:${FIELD_CODES[action.field]}:${action.value}:${action.fixtureId}`;
    case "reportMotm":
      return `v:${action.playerId}`;
    case "reportSkip":
      return `x:${action.fixtureId}`;
    case "noop":
      return "-";
  }
}

export function decodeCallback(data: string): CallbackAction | null {
  const parts = data.split(":");
  const head = parts[0];

  switch (head) {
    case "r": {
      const status = RSVP_BY_CODE[parts[1] ?? ""];
      const fixtureId = parts[2];
      return status && fixtureId ? { kind: "rsvp", status, fixtureId } : null;
    }
    case "q": {
      const fixtureId = parts[1];
      return fixtureId ? { kind: "squad", fixtureId } : null;
    }
    case "c":
      return { kind: "myCard" };
    case "t":
      return { kind: "table" };
    case "h":
      return { kind: "help" };
    case "p": {
      const field = FIELD_BY_CODE[parts[1] ?? ""];
      const value = Number(parts[2]);
      const fixtureId = parts[3];
      if (!field || !fixtureId || !Number.isFinite(value)) return null;
      return { kind: "report", field, value, fixtureId };
    }
    case "v": {
      const playerId = parts[1];
      return playerId ? { kind: "reportMotm", playerId } : null;
    }
    case "x": {
      const fixtureId = parts[1];
      return fixtureId ? { kind: "reportSkip", fixtureId } : null;
    }
    case "-":
      return { kind: "noop" };
    default:
      return null;
  }
}

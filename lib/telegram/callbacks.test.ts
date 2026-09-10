import { describe, expect, it } from "vitest";
import {
  CALLBACK_DATA_MAX_BYTES,
  decodeCallback,
  encodeCallback,
  type CallbackAction,
} from "./callbacks";

const UUID = "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e";

const SAMPLES: CallbackAction[] = [
  { kind: "rsvp", status: "in", fixtureId: UUID },
  { kind: "rsvp", status: "out", fixtureId: UUID },
  { kind: "rsvp", status: "maybe", fixtureId: UUID },
  { kind: "squad", fixtureId: UUID },
  { kind: "myCard" },
  { kind: "table" },
  { kind: "help" },
  { kind: "report", field: "goals", value: 3, fixtureId: UUID },
  { kind: "report", field: "rating", value: 10, fixtureId: UUID },
  { kind: "reportMotm", playerId: UUID },
  { kind: "reportSkip", fixtureId: UUID },
  { kind: "noop" },
];

describe("callback data", () => {
  it("round-trips every action", () => {
    for (const action of SAMPLES) {
      expect(decodeCallback(encodeCallback(action)), JSON.stringify(action)).toEqual(action);
    }
  });

  it("never exceeds Telegram's 64-byte limit", () => {
    for (const action of SAMPLES) {
      const bytes = new TextEncoder().encode(encodeCallback(action)).length;
      expect(bytes, `${JSON.stringify(action)} is ${bytes} bytes`).toBeLessThanOrEqual(
        CALLBACK_DATA_MAX_BYTES,
      );
    }
  });

  it("refuses to build something oversized rather than failing at send time", () => {
    const tooLong = "x".repeat(80);
    expect(() => encodeCallback({ kind: "squad", fixtureId: tooLong })).toThrow(/64-byte limit/);
  });

  it("leaves plenty of headroom on the longest action", () => {
    const longest = Math.max(
      ...SAMPLES.map((a) => new TextEncoder().encode(encodeCallback(a)).length),
    );
    // If this ever creeps close to 64, the id scheme needs rethinking, not nudging.
    expect(longest).toBeLessThan(50);
  });

  it("returns null for anything it does not recognise", () => {
    expect(decodeCallback("")).toBeNull();
    expect(decodeCallback("zzz")).toBeNull();
    expect(decodeCallback("r")).toBeNull();
    expect(decodeCallback("r:i")).toBeNull();
    expect(decodeCallback("r:zzz:" + UUID)).toBeNull();
    expect(decodeCallback("p:g:notanumber:" + UUID)).toBeNull();
  });

  it("does not confuse one action prefix for another", () => {
    expect(decodeCallback(encodeCallback({ kind: "table" }))).toEqual({ kind: "table" });
    expect(decodeCallback(encodeCallback({ kind: "myCard" }))).toEqual({ kind: "myCard" });
  });
});

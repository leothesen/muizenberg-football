import { describe, expect, it } from "vitest";
import { parseTimeOfDay, parseWhen } from "./when";

/** Monday 14 September 2026, 09:00 SAST. */
const MONDAY_MORNING = new Date("2026-09-14T07:00:00Z");

function when(input: string, now = MONDAY_MORNING) {
  return parseWhen(input, now);
}

describe("parseTimeOfDay", () => {
  it("reads the forms people actually type", () => {
    expect(parseTimeOfDay("6pm")).toEqual({ hour: 18, minute: 0 });
    expect(parseTimeOfDay("6:30pm")).toEqual({ hour: 18, minute: 30 });
    expect(parseTimeOfDay("18:00")).toEqual({ hour: 18, minute: 0 });
    expect(parseTimeOfDay("18h30")).toEqual({ hour: 18, minute: 30 });
    expect(parseTimeOfDay("7am")).toEqual({ hour: 7, minute: 0 });
  });

  it("handles the midnight and noon corners", () => {
    expect(parseTimeOfDay("12am")).toEqual({ hour: 0, minute: 0 });
    expect(parseTimeOfDay("12pm")).toEqual({ hour: 12, minute: 0 });
  });

  it("refuses a bare hour that could mean either end of the day", () => {
    // "6" is as likely to be six in the evening as six in the morning, and a fixture
    // at 06:00 would be noticed by nobody until nobody turned up.
    expect(parseTimeOfDay("6")).toBeNull();
    expect(parseTimeOfDay("18")).toEqual({ hour: 18, minute: 0 });
  });

  it("refuses nonsense rather than clamping it", () => {
    expect(parseTimeOfDay("25:00")).toBeNull();
    expect(parseTimeOfDay("6:99pm")).toBeNull();
    expect(parseTimeOfDay("teatime")).toBeNull();
  });
});

describe("parseWhen", () => {
  it("takes a day on its own and assumes the usual hour", () => {
    const parsed = when("thursday");
    expect(parsed!.kickoffAt.toISOString()).toBe("2026-09-17T15:30:00.000Z");
    expect(parsed!.assumedTime).toBe(true);
  });

  it("takes a day and a time", () => {
    expect(when("saturday 4pm")!.kickoffAt.toISOString()).toBe("2026-09-19T14:00:00.000Z");
    expect(when("saturday 4pm")!.assumedTime).toBe(false);
  });

  it("accepts short day names and filler words", () => {
    // "on sat at 4pm" is a thing somebody types with one hand.
    expect(when("on sat at 4pm")!.kickoffAt.toISOString()).toBe("2026-09-19T14:00:00.000Z");
    expect(when("this thurs")!.kickoffAt.toISOString()).toBe("2026-09-17T15:30:00.000Z");
  });

  it("kicks a weekend game off earlier than a weeknight", () => {
    // A Saturday game is not an after-work game.
    expect(when("saturday")!.kickoffAt.toISOString()).toContain("T15:00");
    expect(when("thursday")!.kickoffAt.toISOString()).toContain("T15:30");
  });

  it("handles tomorrow and tonight", () => {
    expect(when("tomorrow 6pm")!.kickoffAt.toISOString()).toBe("2026-09-15T16:00:00.000Z");
    expect(when("tonight 7pm")!.kickoffAt.toISOString()).toBe("2026-09-14T17:00:00.000Z");
  });

  it("rolls a named day forward when its slot has already gone", () => {
    // Somebody saying "Monday" on a Monday evening means next Monday. A game in the
    // past is the one answer that is certainly wrong.
    const mondayEvening = new Date("2026-09-14T19:00:00Z");
    expect(when("monday", mondayEvening)!.kickoffAt.toISOString()).toBe(
      "2026-09-21T15:30:00.000Z",
    );
  });

  it("refuses a tonight that has already happened", () => {
    // Unlike a named day, "tonight" cannot sensibly roll a week forward — the sender
    // meant tonight, and the honest answer is to say it has gone.
    const lateEvening = new Date("2026-09-14T21:00:00Z");
    expect(when("tonight", lateEvening)).toBeNull();
  });

  it("is always in the future", () => {
    for (const input of ["monday", "tuesday", "saturday", "sunday", "tomorrow 8pm"]) {
      for (let hour = 0; hour < 24 * 7; hour += 7) {
        const now = new Date(MONDAY_MORNING.getTime() + hour * 60 * 60 * 1000);
        const parsed = parseWhen(input, now);
        if (parsed) {
          expect(parsed.kickoffAt.getTime(), `${input} at ${now.toISOString()}`).toBeGreaterThan(
            now.getTime(),
          );
        }
      }
    }
  });

  it("refuses a word it does not understand rather than guessing", () => {
    // Quietly ignoring the bit it could not read is how you book a game nobody asked
    // for on a day nobody meant.
    expect(when("next tuesday week")).toBeNull();
    expect(when("whenever")).toBeNull();
    expect(when("14 september")).toBeNull();
    expect(when("")).toBeNull();
  });

  it("refuses a time with no day", () => {
    expect(when("6pm")).toBeNull();
  });
});

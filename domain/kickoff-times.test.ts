import { describe, expect, it } from "vitest";
import { sunsetOn } from "./daylight";
import {
  DEFAULT_KICKOFF_TIME,
  KICKOFF_TIMES,
  TIME_CHANGE_THRESHOLD,
  kickoffTimeByKey,
  kickoffTimeOf,
  resolveTime,
  sunsetLabel,
  timesOnOffer,
} from "./kickoff-times";
import { kickoffOn, nightByKey } from "./nights";

function votes(...times: string[]): { time: string }[] {
  return times.map((time) => ({ time }));
}

/** Local noon on a date, which is all a "which day" argument needs. */
function day(iso: string): Date {
  return new Date(`${iso}T10:00:00Z`);
}

describe("sunsetOn", () => {
  // Published times for Cape Town, to the minute. The formula is good to a minute or
  // two; a kickoff moves in half hours.
  it.each([
    ["2026-06-21", "17:45"],
    ["2026-09-23", "18:42"],
    ["2026-12-21", "19:57"],
  ])("puts sunset at Zandvlei on %s at about %s", (date, expected) => {
    const [hh, mm] = expected.split(":").map(Number);
    const got = sunsetLabel(day(date)).split(":").map(Number);
    const minutes = (got[0]! - hh!) * 60 + (got[1]! - mm!);
    expect(Math.abs(minutes)).toBeLessThanOrEqual(3);
  });

  it("is on the day asked about, not the day before or after", () => {
    const sunset = sunsetOn(day("2026-12-21"));
    expect(sunset.toISOString().slice(0, 10)).toBe("2026-12-21");
  });
});

describe("timesOnOffer", () => {
  it("offers only 17:30 in midwinter, when nothing later finishes in daylight", () => {
    expect(timesOnOffer(day("2026-06-24")).map((t) => t.label)).toEqual(["17:30"]);
  });

  it("offers an hour of later kickoffs at midsummer", () => {
    expect(timesOnOffer(day("2026-12-23")).map((t) => t.label)).toEqual([
      "17:30",
      "18:00",
      "18:30",
      "19:00",
    ]);
  });

  it("grows as the evenings get longer", () => {
    const now = timesOnOffer(day("2026-09-23")).length;
    const later = timesOnOffer(day("2026-11-04")).length;
    expect(later).toBeGreaterThan(now);
  });

  it("always includes the usual time", () => {
    for (const date of ["2026-01-07", "2026-06-24", "2026-09-23"]) {
      expect(timesOnOffer(day(date))[0]).toEqual(DEFAULT_KICKOFF_TIME);
    }
  });
});

describe("resolveTime", () => {
  it("keeps 17:30 when nobody votes", () => {
    const outcome = resolveTime([]);
    expect(outcome.time).toEqual(DEFAULT_KICKOFF_TIME);
    expect(outcome.byDefault).toBe(true);
  });

  it("does not let one person move everybody's evening", () => {
    expect(resolveTime(votes("1900")).time.label).toBe("17:30");
  });

  it("moves once enough people want a later start", () => {
    const later = Array.from({ length: TIME_CHANGE_THRESHOLD }, () => "1830");
    const outcome = resolveTime(votes(...later));
    expect(outcome.time.label).toBe("18:30");
    expect(outcome.byDefault).toBe(false);
  });

  it("needs to beat 17:30, not just reach the threshold", () => {
    const outcome = resolveTime(votes("1830", "1830", "1830", "1730", "1730", "1730"));
    expect(outcome.time.label).toBe("17:30");
  });

  it("breaks a tie between later times towards the earlier one", () => {
    const outcome = resolveTime(votes("1900", "1900", "1900", "1800", "1800", "1800"));
    expect(outcome.time.label).toBe("18:00");
  });

  it("ignores votes for a time that is not on offer", () => {
    const offered = KICKOFF_TIMES.slice(0, 2);
    const outcome = resolveTime(votes("1900", "1900", "1900"), offered);
    expect(outcome.time.label).toBe("17:30");
    expect(outcome.tally.map((t) => t.option.label)).toEqual(["17:30", "18:00"]);
  });
});

describe("kickoff time keys", () => {
  it("round-trips through the key a button carries", () => {
    for (const option of KICKOFF_TIMES) {
      expect(kickoffTimeByKey(option.key)).toEqual(option);
    }
    expect(kickoffTimeByKey("2400")).toBeNull();
  });

  it("reads a fixture's kickoff back as a time", () => {
    const wed = nightByKey("wed")!;
    const kickoff = kickoffOn(wed, new Date("2026-12-14T07:00:00Z"), { hour: 18, minute: 30 });
    expect(kickoffTimeOf(kickoff).label).toBe("18:30");
  });
});

describe("kickoffOn with a voted time", () => {
  it("books the chosen night at the chosen time", () => {
    const monday = new Date("2026-12-14T07:00:00Z");
    const kickoff = kickoffOn(nightByKey("wed")!, monday, { hour: 19, minute: 0 });
    // 19:00 SAST is 17:00 UTC.
    expect(kickoff.toISOString()).toBe("2026-12-16T17:00:00.000Z");
  });

  it("uses the night's own time when none was voted", () => {
    const monday = new Date("2026-12-14T07:00:00Z");
    expect(kickoffOn(nightByKey("wed")!, monday).toISOString()).toBe("2026-12-16T15:30:00.000Z");
  });
});

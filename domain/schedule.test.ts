import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE,
  describeKickoff,
  nextFixtureSchedule,
  nextKickoff,
  relativeKickoff,
  scheduleFor,
} from "./schedule";

// South Africa is UTC+2 year round, so an 18:00 local kickoff is 16:00Z.
const WED_2026_09_09_KICKOFF = new Date("2026-09-09T16:00:00Z");

describe("nextKickoff", () => {
  it("finds this Wednesday from earlier in the week", () => {
    // Monday morning, SAST.
    expect(nextKickoff(new Date("2026-09-07T06:00:00Z"))).toEqual(WED_2026_09_09_KICKOFF);
  });

  it("still returns tonight on Wednesday afternoon", () => {
    // 15:00 SAST on match day.
    expect(nextKickoff(new Date("2026-09-09T13:00:00Z"))).toEqual(WED_2026_09_09_KICKOFF);
  });

  it("rolls to next week once kickoff has passed", () => {
    expect(nextKickoff(new Date("2026-09-09T16:00:01Z"))).toEqual(
      new Date("2026-09-16T16:00:00Z"),
    );
  });

  it("rolls forward on a Thursday", () => {
    expect(nextKickoff(new Date("2026-09-10T08:00:00Z"))).toEqual(
      new Date("2026-09-16T16:00:00Z"),
    );
  });

  it("does not shift when the caller sits in another timezone", () => {
    // Same instant, expressed with an offset. The answer must not move.
    expect(nextKickoff(new Date("2026-09-07T23:00:00-07:00"))).toEqual(WED_2026_09_09_KICKOFF);
  });

  it("respects a different weekday and time", () => {
    const sundayMorning = { ...DEFAULT_SCHEDULE, weekday: 0, hour: 9, minute: 30 };
    expect(nextKickoff(new Date("2026-09-09T13:00:00Z"), sundayMorning)).toEqual(
      new Date("2026-09-13T07:30:00Z"),
    );
  });
});

describe("scheduleFor", () => {
  const schedule = scheduleFor(WED_2026_09_09_KICKOFF);

  it("asks the group on the Tuesday afternoon before", () => {
    // 16:00 SAST on Tue 8 Sep is 14:00Z.
    expect(schedule.rsvpOpensAt).toEqual(new Date("2026-09-08T14:00:00Z"));
  });

  it("locks the squad at midday on match day", () => {
    expect(schedule.rsvpClosesAt).toEqual(new Date("2026-09-09T10:00:00Z"));
  });

  it("asks how it went once the game is over", () => {
    expect(schedule.reportsOpenAt).toEqual(new Date("2026-09-09T18:00:00Z"));
  });

  it("keeps every moment in the right order", () => {
    expect(schedule.rsvpOpensAt.getTime()).toBeLessThan(schedule.rsvpClosesAt.getTime());
    expect(schedule.rsvpClosesAt.getTime()).toBeLessThan(schedule.kickoffAt.getTime());
    expect(schedule.kickoffAt.getTime()).toBeLessThan(schedule.reportsOpenAt.getTime());
  });

  it("gives the group roughly a day to answer", () => {
    const hours =
      (schedule.rsvpClosesAt.getTime() - schedule.rsvpOpensAt.getTime()) / 3_600_000;
    expect(hours).toBe(20);
  });
});

describe("nextFixtureSchedule", () => {
  it("wires the whole week together from a single instant", () => {
    const schedule = nextFixtureSchedule(new Date("2026-09-07T06:00:00Z"));
    expect(schedule.kickoffAt).toEqual(WED_2026_09_09_KICKOFF);
    expect(schedule.rsvpOpensAt).toEqual(new Date("2026-09-08T14:00:00Z"));
  });
});

describe("describeKickoff", () => {
  it("reads the way somebody would say it out loud", () => {
    expect(describeKickoff(WED_2026_09_09_KICKOFF)).toBe("Wednesday 9 September, 18:00");
  });

  it("renders in league time, not the server's", () => {
    // 23:30Z is 01:30 the next day in Johannesburg.
    expect(describeKickoff(new Date("2026-09-09T23:30:00Z"))).toBe(
      "Thursday 10 September, 01:30",
    );
  });
});

describe("relativeKickoff", () => {
  it("says tonight on match day", () => {
    expect(relativeKickoff(WED_2026_09_09_KICKOFF, new Date("2026-09-09T06:00:00Z"))).toBe(
      "tonight",
    );
  });

  it("says tomorrow when the poll goes out", () => {
    expect(relativeKickoff(WED_2026_09_09_KICKOFF, new Date("2026-09-08T14:00:00Z"))).toBe(
      "tomorrow",
    );
  });

  it("names the day earlier in the week", () => {
    expect(relativeKickoff(WED_2026_09_09_KICKOFF, new Date("2026-09-07T06:00:00Z"))).toBe(
      "on Wednesday",
    );
  });

  it("falls back to a full date further out", () => {
    expect(relativeKickoff(WED_2026_09_09_KICKOFF, new Date("2026-08-20T06:00:00Z"))).toBe(
      "Wednesday 9 September, 18:00",
    );
  });

  it("knows when it has already gone", () => {
    expect(relativeKickoff(WED_2026_09_09_KICKOFF, new Date("2026-09-11T06:00:00Z"))).toBe(
      "already gone",
    );
  });
});

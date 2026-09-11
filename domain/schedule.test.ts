import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE,
  describeKickoff,
  nextFixtureSchedule,
  nextKickoff,
  relativeKickoff,
  rsvpWindowOpen,
  scheduleFor,
  withinNudgeWindow,
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

describe("the crons decide for themselves whether today is the day", () => {
  // A Thursday 17:30 SAST kickoff: deliberately not the Wednesday 18:00 the old
  // crontab hard-coded, because that is the case this whole change exists for. Every
  // window below has to fall out of this kickoff rather than out of a weekday.
  const THU_1730 = new Date("2026-09-17T15:30:00Z");

  describe("rsvpWindowOpen", () => {
    it("stays shut two days out", () => {
      expect(rsvpWindowOpen(THU_1730, new Date("2026-09-15T12:00:00Z"))).toBe(false);
    });

    it("opens the afternoon before, on the right day for THIS kickoff", () => {
      // 16:00 SAST on the Wednesday. Under the old fixed crontab nothing would have
      // asked the group at all, because the poll only ever went out on a Tuesday.
      expect(rsvpWindowOpen(THU_1730, new Date("2026-09-16T14:00:00Z"))).toBe(true);
    });

    it("is still open on the day of the game", () => {
      expect(rsvpWindowOpen(THU_1730, new Date("2026-09-17T08:00:00Z"))).toBe(true);
    });
  });

  describe("withinNudgeWindow", () => {
    it("does not chase anybody days in advance", () => {
      // The fixture is pinned to the top of the chat precisely so that nobody needs
      // a private message until the day itself.
      expect(withinNudgeWindow(THU_1730, new Date("2026-09-15T05:00:00Z"))).toBe(false);
    });

    it("chases on the morning of the game", () => {
      expect(withinNudgeWindow(THU_1730, new Date("2026-09-17T05:00:00Z"))).toBe(true);
    });

    it("never nudges after kickoff", () => {
      // The single most annoying message the bot could send: come and play, arriving
      // while the game is already under way.
      expect(withinNudgeWindow(THU_1730, new Date("2026-09-17T16:00:00Z"))).toBe(false);
    });

    it("catches an early weekend kickoff from the same daily cron", () => {
      // A Saturday game kicks off in the morning, so the window has to reach back
      // into the previous evening or nobody is ever chased for one.
      const SAT_0900 = new Date("2026-09-19T07:00:00Z");
      expect(withinNudgeWindow(SAT_0900, new Date("2026-09-18T17:00:00Z"))).toBe(true);
    });
  });
});

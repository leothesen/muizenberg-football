import { describe, expect, it } from "vitest";
import {
  NIGHT_OPTIONS,
  WEEKEND_THRESHOLD,
  kickoffOn,
  nightByKey,
  resolveNights,
  tallyNights,
  usualNight,
  weekStart,
} from "./nights";

function votes(...nights: string[]): { night: string }[] {
  return nights.map((night) => ({ night }));
}

/** Monday 14 September 2026, 09:00 SAST. */
const MONDAY = new Date("2026-09-14T07:00:00Z");

describe("resolveNights", () => {
  it("always produces a game, even from an empty poll", () => {
    // The single most important behaviour here. A group of 38 will ignore a poll
    // regularly, and a poll that resolves to silence is exactly the dead week the
    // whole thing exists to prevent.
    const outcome = resolveNights([]);

    expect(outcome.weeknight).toEqual(usualNight());
    expect(outcome.byDefault).toBe(true);
  });

  it("takes the night with the most votes", () => {
    const outcome = resolveNights(votes("thu", "thu", "thu", "wed"));
    expect(outcome.weeknight.key).toBe("thu");
    expect(outcome.byDefault).toBe(false);
  });

  it("lets one person vote for several nights", () => {
    // Somebody who can do Wednesday or Thursday should be able to say so. A
    // single-choice poll would split that answer and pick a worse night than either.
    const outcome = resolveNights(votes("wed", "thu", "wed", "thu", "thu"));
    expect(outcome.weeknight.key).toBe("thu");
    expect(outcome.tally.find((t) => t.option.key === "wed")?.votes).toBe(2);
  });

  it("breaks a tie towards the usual night", () => {
    // Nobody has to relearn anything on a week where the vote was inconclusive.
    const outcome = resolveNights(votes("tue", "wed"));
    expect(outcome.weeknight.key).toBe("wed");
  });

  it("breaks a tie that excludes the usual night towards the earlier one", () => {
    // Earlier beats later: a Tuesday half the group misses can still be followed by
    // somebody calling another game that week. A Thursday cannot.
    const outcome = resolveNights(votes("tue", "thu"));
    expect(outcome.weeknight.key).toBe("tue");
  });

  it("never lets a weekend vote become the main game", () => {
    // Fifty Sunday votes and one Tuesday vote is still a Tuesday league with a Sunday
    // game on top, not a Sunday league.
    const outcome = resolveNights(votes(...Array(50).fill("sun"), "tue"));
    expect(outcome.weeknight.key).toBe("tue");
    expect(outcome.weekend?.key).toBe("sun");
  });
});

describe("the weekend game", () => {
  it("is not booked on a handful of votes", () => {
    // A second fixture nobody turns up to splits the week's turnout and teaches
    // people that the bot books games that do not happen.
    const outcome = resolveNights(votes("wed", ...Array(WEEKEND_THRESHOLD - 1).fill("sat")));
    expect(outcome.weekend).toBeNull();
  });

  it("is booked once enough people actually want it", () => {
    const outcome = resolveNights(votes("wed", ...Array(WEEKEND_THRESHOLD).fill("sat")));
    expect(outcome.weekend?.key).toBe("sat");
  });

  it("picks the more popular of the two weekend days", () => {
    const outcome = resolveNights(
      votes("wed", ...Array(WEEKEND_THRESHOLD).fill("sat"), ...Array(WEEKEND_THRESHOLD + 3).fill("sun")),
    );
    expect(outcome.weekend?.key).toBe("sun");
  });

  it("does not appear just because the weeknight was busy", () => {
    const outcome = resolveNights(votes(...Array(20).fill("wed")));
    expect(outcome.weekend).toBeNull();
  });
});

describe("tallyNights", () => {
  it("lists every night, including the ones nobody picked", () => {
    // The keyboard shows all five with their counts. A missing night would render as
    // a gap and read as a bug.
    const tally = tallyNights(votes("wed"));
    expect(tally).toHaveLength(NIGHT_OPTIONS.length);
    expect(tally.every((entry) => typeof entry.votes === "number")).toBe(true);
  });

  it("ignores a night that is not on the keyboard", () => {
    // Callback payloads come off the wire and can name anything.
    const tally = tallyNights(votes("mon", "wed"));
    expect(tally.reduce((sum, entry) => sum + entry.votes, 0)).toBe(1);
  });
});

describe("kickoffOn", () => {
  it("finds this week's night when it is still ahead", () => {
    // Monday morning, voting for Wednesday: that is two days away, not nine.
    const kickoff = kickoffOn(nightByKey("wed")!, MONDAY);
    expect(kickoff.toISOString()).toBe("2026-09-16T16:00:00.000Z");
  });

  it("rolls to next week once the night has passed", () => {
    // Thursday evening, after kickoff, asking about Tuesday.
    const thursdayNight = new Date("2026-09-17T19:00:00Z");
    const kickoff = kickoffOn(nightByKey("tue")!, thursdayNight);
    expect(kickoff.toISOString()).toBe("2026-09-22T16:00:00.000Z");
  });

  it("puts a Sunday game at the end of the week, not the start", () => {
    // Sunday is weekday 0, so naive arithmetic sends it backwards into the week that
    // has already happened.
    const kickoff = kickoffOn(nightByKey("sun")!, MONDAY);
    expect(kickoff.toISOString()).toBe("2026-09-20T15:00:00.000Z");
    expect(kickoff.getTime()).toBeGreaterThan(MONDAY.getTime());
  });

  it("kicks a weekend game off earlier, because it is not an after-work game", () => {
    const sat = kickoffOn(nightByKey("sat")!, MONDAY);
    const wed = kickoffOn(nightByKey("wed")!, MONDAY);
    // 17:00 vs 18:00 SAST.
    expect(sat.toISOString()).toContain("T15:00");
    expect(wed.toISOString()).toContain("T16:00");
  });

  it("is always in the future, for every night and every starting point", () => {
    for (const option of NIGHT_OPTIONS) {
      for (let hour = 0; hour < 24 * 7; hour += 5) {
        const now = new Date(MONDAY.getTime() + hour * 60 * 60 * 1000);
        expect(
          kickoffOn(option, now).getTime(),
          `${option.key} at ${now.toISOString()}`,
        ).toBeGreaterThan(now.getTime());
      }
    }
  });
});

describe("weekStart", () => {
  it("is the Monday of the week", () => {
    expect(weekStart(MONDAY)).toBe("2026-09-14");
    expect(weekStart(new Date("2026-09-16T12:00:00Z"))).toBe("2026-09-14");
  });

  it("keeps Sunday in the week that is finishing, not the one starting", () => {
    // A Sunday game is voted for on the Monday six days earlier, so the vote and the
    // game have to land in the same poll.
    expect(weekStart(new Date("2026-09-20T12:00:00Z"))).toBe("2026-09-14");
    expect(weekStart(new Date("2026-09-21T06:00:00Z"))).toBe("2026-09-21");
  });

  it("reads the week in league time, not UTC", () => {
    // 01:00 SAST on Monday is still Sunday in UTC. Getting this wrong would put the
    // first votes of a poll into the previous week's tally.
    expect(weekStart(new Date("2026-09-13T23:00:00Z"))).toBe("2026-09-14");
  });
});

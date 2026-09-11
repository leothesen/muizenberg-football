import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPTION_LIMIT } from "@/lib/bot/illustrate";
import { welcomeCaption } from "@/lib/bot/onboarding";
import { WEEK_STAGES, welcomeSize } from "./welcome-image";

/**
 * The welcome picture makes three promises about when things happen, to somebody who
 * has just arrived and has no other way of knowing. Those promises are only true
 * while `vercel.json` agrees with them, and nothing else connects the two — moving a
 * cron would leave the image confidently telling every new player the wrong time,
 * with no test failing and nothing in the chat looking wrong.
 */

interface VercelCron {
  path: string;
  schedule: string;
}

function crons(): Record<string, VercelCron> {
  const raw = readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8");
  const parsed = JSON.parse(raw) as { crons: VercelCron[] };
  return Object.fromEntries(parsed.crons.map((cron) => [cron.path, cron]));
}

/** The weekday field of a cron expression: "0 14 * * 2" -> "2", daily -> "*". */
function weekdayField(schedule: string): string {
  return schedule.split(/\s+/)[4]!;
}

describe("the welcome picture's timetable", () => {
  const byPath = crons();

  // In the order the picture shows them, which is the order a week runs.
  const stageCrons = [
    "/api/cron/rsvp/open",
    "/api/cron/teams/pick",
    "/api/cron/results/settle",
  ];

  it.each(stageCrons)("%s runs every day, as the picture promises", (cronPath) => {
    // The picture used to read "TUE 16:00 / WED 12:00 / THU 08:00", taken straight
    // from these cron expressions. It now says DAY BEFORE / MATCH DAY / NEXT MORNING,
    // which is only true while the crons run daily and work out for themselves
    // whether today is the day. Re-pinning a weekday here would silently make the
    // picture lie to every newcomer the first time the group plays on a Thursday —
    // and nothing in the chat would look wrong.
    const cron = byPath[cronPath];
    expect(cron, `${cronPath} is not in vercel.json`).toBeDefined();
    expect(weekdayField(cron!.schedule), `${cronPath} is pinned to a weekday`).toBe("*");
  });

  it("reads the weekday field and not some other column", () => {
    // Guards the guard: a version of this that always returned "*" would let every
    // check above pass while the crons went back to being pinned.
    expect(weekdayField("0 14 * * 2")).toBe("2");
    expect(weekdayField("0 14 * * *")).toBe("*");
  });

  it("names no weekday, because the night is the group's to choose", () => {
    const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    for (const stage of WEEK_STAGES) {
      for (const day of weekdays) {
        expect(stage.when.toUpperCase(), `${stage.when} names a weekday`).not.toContain(
          day,
        );
      }
    }
  });

  it("shows exactly the three stages a newcomer has a part in", () => {
    expect(WEEK_STAGES).toHaveLength(3);
    for (const stage of WEEK_STAGES) {
      expect(stage.yourPart.length).toBeGreaterThan(0);
    }
  });
});

describe("the welcome caption", () => {
  it("fits under a photo", () => {
    // Telegram rejects the whole message, picture included, over the limit — so a
    // caption that grew past it would lose the welcome entirely, not just trim it.
    expect(welcomeCaption("Sipho").length).toBeLessThanOrEqual(CAPTION_LIMIT);
  });

  it("survives a name with an angle bracket in it", () => {
    expect(welcomeCaption("<script>")).toContain("&lt;script&gt;");
    expect(welcomeCaption("<script>")).not.toContain("<script>");
  });

  it("says the message is private, because that is not obvious in a group", () => {
    expect(welcomeCaption("Sipho")).toContain("Only you can see this");
  });
});

describe("welcomeSize", () => {
  it("is fixed, because the picture never grows with data", () => {
    expect(welcomeSize()).toEqual(welcomeSize());
    expect(welcomeSize().width).toBeGreaterThan(0);
    expect(welcomeSize().height).toBeGreaterThan(0);
  });
});

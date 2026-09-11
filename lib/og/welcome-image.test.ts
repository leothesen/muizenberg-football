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

/** Cape Town is UTC+2 all year — no daylight saving, so this is a constant. */
const SAST_OFFSET = 2;

const DAY_NAMES: Record<string, string> = {
  "2": "TUE",
  "3": "WED",
  "4": "THU",
};

/** "0 14 * * 2" -> "TUE 16:00" */
function localLabel(schedule: string): string {
  const [minute, hour, , , weekday] = schedule.split(/\s+/);
  const local = (Number(hour) + SAST_OFFSET) % 24;
  const day = DAY_NAMES[weekday!];

  return `${day} ${String(local).padStart(2, "0")}:${minute!.padStart(2, "0")}`;
}

describe("the welcome picture's timetable", () => {
  const byPath = crons();

  // In the order the picture shows them, which is the order the week runs.
  const expected: [string, string][] = [
    ["/api/cron/rsvp/open", WEEK_STAGES[0]!.when],
    ["/api/cron/teams/pick", WEEK_STAGES[1]!.when],
    ["/api/cron/results/settle", WEEK_STAGES[2]!.when],
  ];

  it.each(expected)("matches the %s cron in vercel.json", (cronPath, shown) => {
    const cron = byPath[cronPath];
    expect(cron, `${cronPath} is not in vercel.json`).toBeDefined();
    expect(localLabel(cron!.schedule)).toBe(shown);
  });

  it("converts the cron's UTC into the time a player in Muizenberg reads", () => {
    // Guards the guard: if this ever returned the UTC hour unchanged, every check
    // above would still pass as long as somebody "fixed" the image to match.
    expect(localLabel("0 14 * * 2")).toBe("TUE 16:00");
    expect(localLabel("0 6 * * 4")).toBe("THU 08:00");
    expect(localLabel("30 22 * * 3")).toBe("WED 00:30");
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

import { describe, expect, it } from "vitest";
import type { SquadHealth } from "@/domain/squad";
import { nudgeMessage, shouldNudge } from "./nudge";

function health(overrides: Partial<SquadHealth> = {}): SquadHealth {
  return {
    confirmed: 10,
    capacity: 22,
    spotsLeft: 12,
    waitlistLength: 0,
    viable: true,
    shortBy: 0,
    full: false,
    ...overrides,
  };
}

const KICKOFF = new Date("2026-09-16T16:00:00Z");
const MATCH_MORNING = new Date("2026-09-16T07:00:00Z");

describe("shouldNudge", () => {
  it("chases when the game is not yet viable", () => {
    expect(shouldNudge(health({ viable: false, shortBy: 3, confirmed: 5, spotsLeft: 17 }))).toBe(true);
  });

  it("chases when there is plenty of room left", () => {
    expect(shouldNudge(health({ spotsLeft: 12 }))).toBe(true);
  });

  it("leaves people alone once the game is nearly full", () => {
    expect(shouldNudge(health({ spotsLeft: 2 }))).toBe(false);
  });

  it("never chases for a full game", () => {
    expect(shouldNudge(health({ full: true, spotsLeft: 0 }))).toBe(false);
  });
});

describe("nudgeMessage", () => {
  it("is blunt about the game falling over when short", () => {
    const text = nudgeMessage({
      firstName: "Leo",
      kickoffAt: KICKOFF,
      now: MATCH_MORNING,
      health: health({ viable: false, shortBy: 3 }),
    });
    expect(text).toContain("we're 3 short");
    expect(text).toContain("falls over without you");
    expect(text).toContain("tonight");
  });

  it("is relaxed when the game is on but has room", () => {
    const text = nudgeMessage({
      firstName: "Leo",
      kickoffAt: KICKOFF,
      now: MATCH_MORNING,
      health: health({ spotsLeft: 8 }),
    });
    expect(text).toContain("8 spots going");
    expect(text).not.toContain("falls over");
  });

  it("escapes the name", () => {
    const text = nudgeMessage({
      firstName: "<b>x</b>",
      kickoffAt: KICKOFF,
      now: MATCH_MORNING,
      health: health(),
    });
    expect(text).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

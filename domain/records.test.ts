import { describe, expect, it } from "vitest";
import {
  careerRecords,
  hallOfFame,
  longestStreak,
  matchRecords,
  singleGameRecords,
  type CareerStatRow,
  type FixtureStatRow,
} from "./records";

function night(overrides: Partial<FixtureStatRow> & { playerId: string }): FixtureStatRow {
  return {
    displayName: overrides.playerId,
    emoji: "⚽",
    fixtureId: "w1",
    kickoffAt: new Date("2026-08-12T16:00:00Z"),
    goals: 0,
    assists: 0,
    nutmegs: 0,
    tackles: 0,
    saves: 0,
    motmVotes: 0,
    outcome: null,
    goalsFor: null,
    goalsAgainst: null,
    ...overrides,
  };
}

function career(overrides: Partial<CareerStatRow> & { playerId: string }): CareerStatRow {
  return {
    displayName: overrides.playerId,
    emoji: "⚽",
    appearances: 0,
    goals: 0,
    assists: 0,
    nutmegs: 0,
    tackles: 0,
    saves: 0,
    motmVotes: 0,
    rating: 65,
    ...overrides,
  };
}

describe("singleGameRecords", () => {
  it("finds the best single night and who did it", () => {
    const records = singleGameRecords([
      night({ playerId: "ann", displayName: "Ann", goals: 4 }),
      night({ playerId: "bob", displayName: "Bob", goals: 2 }),
    ]);

    const goals = records.find((r) => r.key === "most_goals_game");
    expect(goals?.value).toBe(4);
    expect(goals?.holders.map((h) => h.displayName)).toEqual(["Ann"]);
  });

  it("shares a record between everyone who has matched it", () => {
    const records = singleGameRecords([
      night({ playerId: "ann", displayName: "Ann", nutmegs: 3, fixtureId: "w1" }),
      night({ playerId: "bob", displayName: "Bob", nutmegs: 3, fixtureId: "w2" }),
    ]);

    expect(records.find((r) => r.key === "most_nutmegs_game")?.holders).toHaveLength(2);
  });

  it("dates a shared record to the first time it was done", () => {
    const early = new Date("2026-08-12T16:00:00Z");
    const late = new Date("2026-09-02T16:00:00Z");
    const records = singleGameRecords([
      night({ playerId: "bob", goals: 3, fixtureId: "w3", kickoffAt: late }),
      night({ playerId: "ann", goals: 3, fixtureId: "w1", kickoffAt: early }),
    ]);

    expect(records.find((r) => r.key === "most_goals_game")?.achievedAt).toEqual(early);
  });

  it("omits a record nobody has set", () => {
    const records = singleGameRecords([night({ playerId: "ann", goals: 1 })]);
    expect(records.map((r) => r.key)).toEqual(["most_goals_game"]);
  });

  it("has nothing to say about an empty league", () => {
    expect(singleGameRecords([])).toEqual([]);
  });
});

describe("careerRecords", () => {
  it("ranks lifetime totals", () => {
    const records = careerRecords([
      career({ playerId: "ann", displayName: "Ann", goals: 20, appearances: 10 }),
      career({ playerId: "bob", displayName: "Bob", goals: 12, appearances: 14 }),
    ]);

    expect(records.find((r) => r.key === "career_goals")?.holders[0]?.displayName).toBe("Ann");
    expect(records.find((r) => r.key === "career_caps")?.holders[0]?.displayName).toBe("Bob");
  });
});

describe("matchRecords", () => {
  it("finds the biggest win and the highest-scoring night", () => {
    const rows = [
      night({ playerId: "ann", fixtureId: "w1", goalsFor: 9, goalsAgainst: 1 }),
      night({ playerId: "bob", fixtureId: "w1", goalsFor: 1, goalsAgainst: 9 }),
      night({
        playerId: "cat",
        fixtureId: "w2",
        kickoffAt: new Date("2026-08-19T16:00:00Z"),
        goalsFor: 8,
        goalsAgainst: 7,
      }),
    ];

    const records = matchRecords(rows);
    expect(records.find((r) => r.key === "biggest_win")).toMatchObject({
      value: 8,
      description: "9-1",
    });
    expect(records.find((r) => r.key === "highest_scoring")).toMatchObject({
      value: 15,
      description: "8-7",
    });
  });

  it("counts each fixture once however many people reported it", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      night({ playerId: `p${i}`, fixtureId: "w1", goalsFor: 5, goalsAgainst: 5 }),
    );

    expect(matchRecords(rows).find((r) => r.key === "highest_scoring")?.value).toBe(10);
  });

  it("skips fixtures whose score was never agreed", () => {
    expect(matchRecords([night({ playerId: "ann" })])).toEqual([]);
  });

  it("does not claim a biggest win when every game was drawn", () => {
    const records = matchRecords([night({ playerId: "ann", goalsFor: 3, goalsAgainst: 3 })]);
    expect(records.map((r) => r.key)).toEqual(["highest_scoring"]);
  });
});

describe("longestStreak", () => {
  it("finds the longest run anyone has managed, not just the current one", () => {
    const fixtures = ["w1", "w2", "w3", "w4", "w5"];
    const streak = longestStreak(
      fixtures,
      new Map([
        [
          "ann",
          {
            holder: { playerId: "ann", displayName: "Ann", emoji: "⚽" },
            fixtureIds: new Set(["w1", "w2", "w3"]),
          },
        ],
        [
          "bob",
          {
            holder: { playerId: "bob", displayName: "Bob", emoji: "⚽" },
            fixtureIds: new Set(["w1", "w3", "w5"]),
          },
        ],
      ]),
    );

    expect(streak).toMatchObject({ length: 3 });
    expect(streak?.holders.map((h) => h.displayName)).toEqual(["Ann"]);
  });

  it("returns null when nobody has played", () => {
    expect(longestStreak(["w1"], new Map())).toBeNull();
  });
});

describe("hallOfFame", () => {
  it("gathers the three kinds of record together", () => {
    const fame = hallOfFame(
      [night({ playerId: "ann", goals: 3, goalsFor: 6, goalsAgainst: 2 })],
      [career({ playerId: "ann", goals: 3, appearances: 1 })],
    );

    expect(fame.singleGame.length).toBeGreaterThan(0);
    expect(fame.career.length).toBeGreaterThan(0);
    expect(fame.matches.length).toBeGreaterThan(0);
  });
});

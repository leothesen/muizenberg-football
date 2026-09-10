import { describe, expect, it } from "vitest";
import {
  consecutiveAppearances,
  settleFixture,
  teamOfTheWeek,
  type SettlementContext,
  type SettlementPlayer,
  type SubmittedReport,
} from "./settle";
import type { CareerTotals } from "./badges";

function player(overrides: Partial<SettlementPlayer> & { playerId: string }): SettlementPlayer {
  return {
    displayName: overrides.playerId,
    emoji: "⚽",
    rating: 65,
    side: "a",
    isSub: false,
    ...overrides,
  };
}

function report(overrides: Partial<SubmittedReport> & { playerId: string }): SubmittedReport {
  return {
    goals: 0,
    assists: 0,
    nutmegs: 0,
    tackles: 0,
    saves: 0,
    ownGoals: 0,
    selfRating: null,
    motmVoteFor: null,
    goalsFor: null,
    goalsAgainst: null,
    ...overrides,
  };
}

function context(overrides: Partial<SettlementContext> = {}): SettlementContext {
  return {
    players: [],
    reports: [],
    careerBefore: new Map(),
    streakBefore: new Map(),
    badgesHeld: new Map(),
    firstToRespondPlayerId: null,
    promotedPlayerIds: new Set(),
    ...overrides,
  };
}

const veteran: CareerTotals = {
  appearances: 20,
  goals: 20,
  assists: 10,
  nutmegs: 30,
  motmAwards: 6,
};

describe("settleFixture", () => {
  it("settles the score from the reports and reads it from both sides", () => {
    const settlement = settleFixture(
      context({
        players: [
          player({ playerId: "ann", side: "a" }),
          player({ playerId: "bob", side: "b" }),
        ],
        reports: [
          report({ playerId: "ann", goalsFor: 6, goalsAgainst: 4 }),
          report({ playerId: "bob", goalsFor: 4, goalsAgainst: 6 }),
        ],
        careerBefore: new Map([
          ["ann", veteran],
          ["bob", veteran],
        ]),
      }),
    );

    expect(settlement.score).toEqual({ a: 6, b: 4 });
    expect(settlement.consensus.unanimous).toBe(true);
    expect(settlement.players.find((p) => p.playerId === "ann")?.outcome).toBe("win");
    expect(settlement.players.find((p) => p.playerId === "bob")?.outcome).toBe("loss");
  });

  it("leaves the outcome null when nobody reported a score", () => {
    const settlement = settleFixture(
      context({
        players: [player({ playerId: "ann" })],
        reports: [report({ playerId: "ann", goals: 2 })],
      }),
    );

    expect(settlement.score).toBeNull();
    expect(settlement.players[0]?.outcome).toBeNull();
  });

  it("rates everyone who was selected, including those who never answered", () => {
    const settlement = settleFixture(
      context({
        players: [player({ playerId: "ann" }), player({ playerId: "silent" })],
        reports: [report({ playerId: "ann", goals: 2 })],
        careerBefore: new Map([
          ["ann", veteran],
          ["silent", veteran],
        ]),
      }),
    );

    const silent = settlement.players.find((p) => p.playerId === "silent");
    expect(silent?.reported).toBe(false);
    expect(silent?.rating.after).toBeGreaterThan(0);
    // Turning up alone is worth something, but less than turning up and scoring.
    const ann = settlement.players.find((p) => p.playerId === "ann");
    expect(ann!.points).toBeGreaterThan(silent!.points);
    expect(settlement.reportedCount).toBe(1);
  });

  it("counts votes, ignores self-votes and votes for people who did not play", () => {
    const settlement = settleFixture(
      context({
        players: [
          player({ playerId: "ann" }),
          player({ playerId: "bob" }),
          player({ playerId: "cat" }),
        ],
        reports: [
          report({ playerId: "ann", motmVoteFor: "bob" }),
          report({ playerId: "bob", motmVoteFor: "bob" }),
          report({ playerId: "cat", motmVoteFor: "ghost" }),
        ],
        careerBefore: new Map([["bob", veteran]]),
      }),
    );

    expect(settlement.motm).toHaveLength(1);
    expect(settlement.motm[0]).toMatchObject({ playerId: "bob", votes: 1 });
    expect(settlement.players.find((p) => p.playerId === "bob")?.stats.motmVotes).toBe(1);
  });

  it("returns every player tied on the most votes", () => {
    const settlement = settleFixture(
      context({
        players: [
          player({ playerId: "ann", displayName: "Ann" }),
          player({ playerId: "bob", displayName: "Bob" }),
          player({ playerId: "cat", displayName: "Cat" }),
          player({ playerId: "dan", displayName: "Dan" }),
        ],
        reports: [
          report({ playerId: "ann", motmVoteFor: "cat" }),
          report({ playerId: "bob", motmVoteFor: "dan" }),
        ],
      }),
    );

    expect(settlement.motm.map((m) => m.displayName)).toEqual(["Cat", "Dan"]);
  });

  it("has no man of the match when nobody voted", () => {
    const settlement = settleFixture(
      context({
        players: [player({ playerId: "ann" })],
        reports: [report({ playerId: "ann", goals: 1 })],
      }),
    );

    expect(settlement.motm).toEqual([]);
  });

  it("ignores reports from players who were not selected", () => {
    const settlement = settleFixture(
      context({
        players: [player({ playerId: "ann" })],
        reports: [
          report({ playerId: "ann", goals: 1 }),
          report({ playerId: "gatecrasher", goals: 9, goalsFor: 9, goalsAgainst: 0 }),
        ],
      }),
    );

    expect(settlement.reportedCount).toBe(1);
    expect(settlement.score).toBeNull();
    expect(settlement.players).toHaveLength(1);
  });

  it("awards a debut to a first-timer and not to a regular", () => {
    const settlement = settleFixture(
      context({
        players: [player({ playerId: "new" }), player({ playerId: "old" })],
        reports: [report({ playerId: "new" }), report({ playerId: "old" })],
        careerBefore: new Map([["old", veteran]]),
      }),
    );

    expect(settlement.players.find((p) => p.playerId === "new")?.badges).toContain("debut");
    expect(settlement.players.find((p) => p.playerId === "old")?.badges).not.toContain("debut");
  });

  it("does not award a badge somebody already holds", () => {
    const settlement = settleFixture(
      context({
        players: [player({ playerId: "ann" })],
        reports: [report({ playerId: "ann", goals: 3 })],
        careerBefore: new Map([["ann", veteran]]),
        badgesHeld: new Map([["ann", new Set(["hat_trick"])]]),
      }),
    );

    expect(settlement.players[0]?.badges).not.toContain("hat_trick");
  });

  it("rolls tonight's stats into the career totals before checking badges", () => {
    // 9 career goals before tonight plus one tonight is the "10 goals" badge.
    const settlement = settleFixture(
      context({
        players: [player({ playerId: "ann" })],
        reports: [report({ playerId: "ann", goals: 1 })],
        careerBefore: new Map([
          ["ann", { appearances: 9, goals: 9, assists: 0, nutmegs: 0, motmAwards: 0 }],
        ]),
      }),
    );

    expect(settlement.players[0]?.badges).toContain("goals_10");
  });

  it("counts tonight towards a streak", () => {
    const settlement = settleFixture(
      context({
        players: [player({ playerId: "ann" })],
        reports: [report({ playerId: "ann" })],
        careerBefore: new Map([["ann", veteran]]),
        streakBefore: new Map([["ann", 4]]),
      }),
    );

    expect(settlement.players[0]?.badges).toContain("streak_5");
  });

  it("awards a clean sheet only to the side that conceded nothing", () => {
    const settlement = settleFixture(
      context({
        players: [
          player({ playerId: "ann", side: "a" }),
          player({ playerId: "bob", side: "b" }),
        ],
        reports: [
          report({ playerId: "ann", goalsFor: 3, goalsAgainst: 0 }),
          report({ playerId: "bob", goalsFor: 0, goalsAgainst: 3 }),
        ],
        careerBefore: new Map([
          ["ann", veteran],
          ["bob", veteran],
        ]),
      }),
    );

    expect(settlement.players.find((p) => p.playerId === "ann")?.badges).toContain("clean_sheet");
    expect(settlement.players.find((p) => p.playerId === "bob")?.badges).not.toContain(
      "clean_sheet",
    );
  });
});

describe("rating against the night's own average", () => {
  it("moves the busiest players up and the quiet ones down, not everyone up", () => {
    const busy = ["a", "b", "c", "d"].map((id, index) =>
      player({ playerId: id, displayName: id, side: index % 2 === 0 ? "a" : "b" }),
    );

    const settlement = settleFixture(
      context({
        players: busy,
        reports: [
          report({ playerId: "a", goals: 3, assists: 1, tackles: 4, goalsFor: 5, goalsAgainst: 5 }),
          report({ playerId: "b", goals: 1, assists: 1, tackles: 3, goalsFor: 5, goalsAgainst: 5 }),
          report({ playerId: "c", goals: 0, assists: 0, tackles: 1, goalsFor: 5, goalsAgainst: 5 }),
          report({ playerId: "d", goals: 1, assists: 0, tackles: 2, goalsFor: 5, goalsAgainst: 5 }),
        ],
        careerBefore: new Map(busy.map((p) => [p.playerId, veteran])),
      }),
    );

    const deltas = settlement.players.map((p) => p.rating.delta);
    expect(deltas.some((d) => d > 0)).toBe(true);
    expect(deltas.some((d) => d < 0)).toBe(true);

    // The whole night roughly balances out; nobody gets a free ride for showing up.
    const total = deltas.reduce((sum, d) => sum + d, 0);
    expect(Math.abs(total)).toBeLessThan(1);
  });

  it("does not send a generous league to the ceiling", () => {
    // Every player has a big night by any absolute measure. Relative to each other,
    // they are all ordinary, so nothing much should move.
    const squad = ["a", "b", "c", "d", "e", "f"].map((id, index) =>
      player({ playerId: id, displayName: id, rating: 70, side: index % 2 === 0 ? "a" : "b" }),
    );

    const settlement = settleFixture(
      context({
        players: squad,
        reports: squad.map((p) =>
          report({
            playerId: p.playerId,
            goals: 2,
            assists: 2,
            nutmegs: 2,
            tackles: 6,
            goalsFor: 6,
            goalsAgainst: 6,
          }),
        ),
        careerBefore: new Map(squad.map((p) => [p.playerId, veteran])),
      }),
    );

    for (const p of settlement.players) {
      expect(Math.abs(p.rating.delta)).toBeLessThan(0.5);
    }
  });
});

describe("teamOfTheWeek", () => {
  it("ranks by points and excludes anyone who never reported", () => {
    const settlement = settleFixture(
      context({
        players: [
          player({ playerId: "scorer", displayName: "Scorer" }),
          player({ playerId: "grafter", displayName: "Grafter" }),
          player({ playerId: "silent", displayName: "Silent" }),
        ],
        reports: [
          report({ playerId: "scorer", goals: 3 }),
          report({ playerId: "grafter", tackles: 4 }),
        ],
        careerBefore: new Map([
          ["scorer", veteran],
          ["grafter", veteran],
          ["silent", veteran],
        ]),
      }),
    );

    expect(settlement.teamOfTheWeek.map((p) => p.displayName)).toEqual(["Scorer", "Grafter"]);
  });

  it("caps the team at the requested size", () => {
    const players = ["a", "b", "c", "d", "e", "f"].map((id) => ({
      playerId: id,
      displayName: id,
      emoji: "⚽",
      side: "a" as const,
      isSub: false,
      stats: {
        goals: 1,
        assists: 0,
        nutmegs: 0,
        tackles: 0,
        saves: 0,
        ownGoals: 0,
        motmVotes: 0,
      },
      outcome: null,
      points: 3.5,
      reported: true,
      selfRating: null,
      rating: { before: 65, after: 65, delta: 0, performance: 3.5, expected: 2.5, reason: "" },
      badges: [],
      wasMotm: false,
    }));

    expect(teamOfTheWeek(players, 3)).toHaveLength(3);
  });
});

describe("a score already on record", () => {
  it("is used when the reports cannot supply one", () => {
    const settlement = settleFixture(
      context({
        players: [
          player({ playerId: "ann", side: "a" }),
          player({ playerId: "bob", side: "b" }),
        ],
        // Stats but no scoreline — exactly what a replayed fixture looks like when
        // the score was recorded some other way.
        reports: [report({ playerId: "ann", goals: 2 }), report({ playerId: "bob" })],
        careerBefore: new Map([
          ["ann", veteran],
          ["bob", veteran],
        ]),
        recordedScore: { a: 4, b: 1 },
      }),
    );

    expect(settlement.score).toEqual({ a: 4, b: 1 });
    expect(settlement.scoreSource).toBe("recorded");
    expect(settlement.players.find((p) => p.playerId === "ann")?.outcome).toBe("win");
    expect(settlement.players.find((p) => p.playerId === "bob")?.badges).not.toContain(
      "clean_sheet",
    );
  });

  it("never overrides what the players actually said", () => {
    const settlement = settleFixture(
      context({
        players: [
          player({ playerId: "ann", side: "a" }),
          player({ playerId: "bob", side: "b" }),
        ],
        reports: [
          report({ playerId: "ann", goalsFor: 6, goalsAgainst: 4 }),
          report({ playerId: "bob", goalsFor: 4, goalsAgainst: 6 }),
        ],
        recordedScore: { a: 99, b: 0 },
      }),
    );

    expect(settlement.score).toEqual({ a: 6, b: 4 });
    expect(settlement.scoreSource).toBe("reports");
  });

  it("says there was no score when there was neither", () => {
    const settlement = settleFixture(
      context({
        players: [player({ playerId: "ann" })],
        reports: [report({ playerId: "ann", goals: 1 })],
      }),
    );

    expect(settlement.scoreSource).toBe("none");
    expect(settlement.score).toBeNull();
  });
});

describe("consecutiveAppearances", () => {
  it("counts back from the most recent fixture and stops at the first miss", () => {
    const fixtures = ["w4", "w3", "w2", "w1"];
    expect(consecutiveAppearances(fixtures, new Set(["w4", "w3", "w1"]))).toBe(2);
  });

  it("is zero when the player missed the latest game", () => {
    expect(consecutiveAppearances(["w2", "w1"], new Set(["w1"]))).toBe(0);
  });

  it("is zero with no history", () => {
    expect(consecutiveAppearances([], new Set(["w1"]))).toBe(0);
  });
});

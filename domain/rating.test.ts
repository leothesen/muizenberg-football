import { describe, expect, it } from "vitest";
import {
  MAX_SWING,
  RATING_CEILING,
  RATING_FLOOR,
  STARTING_RATING,
  cardAttributes,
  describeContribution,
  expectedPoints,
  performancePoints,
  rateMatch,
} from "./rating";
import { EMPTY_STAT_LINE, type MatchStatLine } from "./types";

function stats(overrides: Partial<MatchStatLine> = {}): MatchStatLine {
  return { ...EMPTY_STAT_LINE, ...overrides };
}

describe("performancePoints", () => {
  it("rewards simply turning up", () => {
    expect(performancePoints(stats(), null)).toBe(0.5);
  });

  it("adds the result on top of the play", () => {
    const quiet = performancePoints(stats(), "win");
    const alsoQuiet = performancePoints(stats(), "loss");
    expect(quiet - alsoQuiet).toBe(2);
  });

  it("weights a goal above an assist above a tackle", () => {
    const goal = performancePoints(stats({ goals: 1 }), null);
    const assist = performancePoints(stats({ assists: 1 }), null);
    const tackle = performancePoints(stats({ tackles: 1 }), null);
    expect(goal).toBeGreaterThan(assist);
    expect(assist).toBeGreaterThan(tackle);
  });

  it("docks own goals", () => {
    expect(performancePoints(stats({ ownGoals: 1 }), null)).toBeLessThan(
      performancePoints(stats(), null),
    );
  });
});

describe("expectedPoints", () => {
  it("asks more of a better player", () => {
    expect(expectedPoints(90)).toBeGreaterThan(expectedPoints(STARTING_RATING));
    expect(expectedPoints(50)).toBeLessThan(expectedPoints(STARTING_RATING));
  });
});

describe("rateMatch", () => {
  it("moves a rating up after a big night", () => {
    const change = rateMatch({
      rating: 65,
      stats: stats({ goals: 3, assists: 1, motmVotes: 2 }),
      outcome: "win",
    });
    expect(change.delta).toBeGreaterThan(0);
    expect(change.after).toBeGreaterThan(change.before);
  });

  it("moves a rating down when a strong player goes missing", () => {
    const change = rateMatch({ rating: 90, stats: stats(), outcome: "loss" });
    expect(change.delta).toBeLessThan(0);
  });

  it("never swings more than the cap in a single game", () => {
    const monster = rateMatch({
      rating: 65,
      stats: stats({ goals: 10, assists: 10, nutmegs: 10, motmVotes: 10 }),
      outcome: "win",
    });
    expect(monster.delta).toBeLessThanOrEqual(MAX_SWING);

    const disaster = rateMatch({
      rating: 99,
      stats: stats({ ownGoals: 5 }),
      outcome: "loss",
    });
    expect(disaster.delta).toBeGreaterThanOrEqual(-MAX_SWING);
  });

  it("keeps ratings inside the floor and ceiling", () => {
    const floored = rateMatch({
      rating: RATING_FLOOR,
      stats: stats({ ownGoals: 3 }),
      outcome: "loss",
    });
    expect(floored.after).toBeGreaterThanOrEqual(RATING_FLOOR);

    const capped = rateMatch({
      rating: RATING_CEILING,
      stats: stats({ goals: 5, motmVotes: 5 }),
      outcome: "win",
    });
    expect(capped.after).toBeLessThanOrEqual(RATING_CEILING);
  });

  it("reports a delta that matches the endpoints it published", () => {
    const change = rateMatch({ rating: 71.4, stats: stats({ goals: 2 }), outcome: "draw" });
    expect(change.after - change.before).toBeCloseTo(change.delta, 5);
  });

  it("holds a mid-rated player steady on an exactly average night", () => {
    const line = stats({ goals: 1, assists: 1, tackles: 3 });
    const average = performancePoints(line, "draw");

    const change = rateMatch({
      rating: STARTING_RATING,
      stats: line,
      outcome: "draw",
      leagueAverage: average,
    });

    expect(change.delta).toBeCloseTo(0, 5);
  });

  it("costs a player who did nothing while everyone else was busy", () => {
    const change = rateMatch({
      rating: STARTING_RATING,
      stats: stats(),
      outcome: "draw",
      leagueAverage: 10,
    });

    expect(change.delta).toBeLessThan(0);
  });

  it("asks a highly rated player to beat the average just to stand still", () => {
    const line = stats({ goals: 1, assists: 1, tackles: 3 });
    const average = performancePoints(line, "draw");

    const good = rateMatch({ rating: 88, stats: line, outcome: "draw", leagueAverage: average });
    const ordinary = rateMatch({
      rating: STARTING_RATING,
      stats: line,
      outcome: "draw",
      leagueAverage: average,
    });

    expect(good.delta).toBeLessThan(0);
    expect(ordinary.delta).toBeCloseTo(0, 5);
  });

  it("does not inflate the whole league when everybody has a busy night", () => {
    // The bug this guards against: with an absolute expectation, a league that
    // routinely earns far more than the baseline sees every single player gain every
    // single week, and the whole group ratchets up to the ceiling.
    const busy = [
      stats({ goals: 2, assists: 1, nutmegs: 1, tackles: 4 }),
      stats({ goals: 1, assists: 2, nutmegs: 2, tackles: 3 }),
      stats({ goals: 0, assists: 1, nutmegs: 1, tackles: 6, saves: 4 }),
      stats({ goals: 3, assists: 0, nutmegs: 0, tackles: 2 }),
    ];
    const average =
      busy.reduce((sum, line) => sum + performancePoints(line, "draw"), 0) / busy.length;

    const deltas = busy.map(
      (line) =>
        rateMatch({ rating: STARTING_RATING, stats: line, outcome: "draw", leagueAverage: average })
          .delta,
    );

    const meanDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
    expect(meanDelta).toBeCloseTo(0, 1);
    expect(deltas.some((d) => d > 0)).toBe(true);
    expect(deltas.some((d) => d < 0)).toBe(true);
  });
});

describe("describeContribution", () => {
  it("says something human when nothing happened", () => {
    expect(describeContribution(stats(), null)).toBe("Turned up.");
    expect(describeContribution(stats(), "win")).toBe("Turned up, and a win.");
  });

  it("pluralises properly", () => {
    expect(describeContribution(stats({ goals: 1 }), null)).toBe("1 goal.");
    expect(describeContribution(stats({ goals: 2 }), null)).toBe("2 goals.");
    expect(describeContribution(stats({ ownGoals: 1 }), null)).toBe("1 own goal.");
  });

  it("joins several contributions with the result last", () => {
    expect(describeContribution(stats({ goals: 2, nutmegs: 1 }), "win")).toBe(
      "2 goals, 1 nutmeg and a win.",
    );
  });

  it("ignores unremarkable tackle and save counts", () => {
    expect(describeContribution(stats({ tackles: 2, saves: 1 }), null)).toBe("Turned up.");
    expect(describeContribution(stats({ tackles: 6 }), null)).toBe("6 tackles.");
  });

  it("keeps the sentence short when everything happened at once", () => {
    const text = describeContribution(
      stats({ goals: 2, assists: 2, nutmegs: 2, tackles: 9, saves: 5, motmVotes: 3 }),
      "win",
    );
    expect(text.split(",").length).toBeLessThanOrEqual(3);
    expect(text.endsWith("a win.")).toBe(true);
  });
});

describe("cardAttributes", () => {
  it("sits everyone at the middle before they have played", () => {
    const card = cardAttributes(
      { goals: 0, assists: 0, nutmegs: 0, tackles: 0, saves: 0, motmVotes: 0 },
      0,
    );
    expect(Object.values(card).every((v) => v === 55)).toBe(true);
  });

  it("does not mint a superstar off one loud game", () => {
    const perGame = { goals: 4, assists: 0, nutmegs: 0, tackles: 0, saves: 0, motmVotes: 0 };
    const oneGame = cardAttributes(perGame, 1);
    const manyGames = cardAttributes(perGame, 40);
    expect(oneGame.finishing).toBeLessThan(manyGames.finishing);
    expect(manyGames.finishing).toBeGreaterThan(90);
  });

  it("keeps every attribute inside the rating scale", () => {
    const card = cardAttributes(
      { goals: 99, assists: 99, nutmegs: 99, tackles: 99, saves: 99, motmVotes: 99 },
      100,
    );
    for (const value of Object.values(card)) {
      expect(value).toBeGreaterThanOrEqual(RATING_FLOOR);
      expect(value).toBeLessThanOrEqual(RATING_CEILING);
    }
  });

  it("separates a defender from a striker", () => {
    const defender = cardAttributes(
      { goals: 0.1, assists: 0.2, nutmegs: 0, tackles: 5, saves: 0, motmVotes: 0.2 },
      20,
    );
    expect(defender.defending).toBeGreaterThan(defender.finishing);
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_SWING,
  RATING_CEILING,
  RATING_FLOOR,
  STARTING_RATING,
  cardAttributes,
  RATING_DELTAS,
  describeContribution,
  nightScore,
  performancePoints,
  rateMatch,
  ratingGravity,
} from "./rating";
import { EMPTY_STAT_LINE, type MatchStatLine } from "./types";

function stats(overrides: Partial<MatchStatLine> = {}): MatchStatLine {
  return { ...EMPTY_STAT_LINE, ...overrides };
}

describe("describeContribution with headers", () => {
  it("says which goals were headers", () => {
    expect(describeContribution(stats({ goals: 1, headedGoals: 1 }), null)).toBe(
      "1 goal (a header).",
    );
    expect(describeContribution(stats({ goals: 3, headedGoals: 1 }), null)).toBe(
      "3 goals (one a header).",
    );
    expect(describeContribution(stats({ goals: 3, headedGoals: 2 }), null)).toBe(
      "3 goals (2 headers).",
    );
    expect(describeContribution(stats({ goals: 2, headedGoals: 2 }), null)).toBe(
      "2 goals (all headers).",
    );
  });
});

describe("performancePoints", () => {
  it("counts a headed goal double", () => {
    const none = performancePoints(stats(), null);
    const tapIn = performancePoints(stats({ goals: 1 }), null);
    const header = performancePoints(stats({ goals: 1, headedGoals: 1 }), null);
    expect(header - none).toBe(2 * (tapIn - none));
  });

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

describe("ratingGravity", () => {
  it("pulls harder on a better player", () => {
    expect(ratingGravity(90)).toBeGreaterThan(ratingGravity(STARTING_RATING));
    expect(ratingGravity(50)).toBeLessThan(ratingGravity(STARTING_RATING));
    expect(ratingGravity(STARTING_RATING)).toBe(0);
  });
});

describe("nightScore", () => {
  it("is the result plus man-of-the-match recognition, nothing self-reported", () => {
    expect(nightScore("win", 0, false)).toBe(RATING_DELTAS.win);
    expect(nightScore("loss", 0, false)).toBe(RATING_DELTAS.loss);
    expect(nightScore("draw", 0, false)).toBe(RATING_DELTAS.draw);
    expect(nightScore(null, 0, false)).toBe(RATING_DELTAS.draw);
    expect(nightScore("loss", 3, true)).toBeCloseTo(
      RATING_DELTAS.loss + 3 * RATING_DELTAS.motmVote + RATING_DELTAS.motmWinner,
      5,
    );
  });
});

describe("rateMatch", () => {
  it("moves a rating up after a win with votes", () => {
    const change = rateMatch({ rating: 65, stats: stats({ motmVotes: 2 }), outcome: "win" });
    expect(change.delta).toBeGreaterThan(0);
    expect(change.after).toBeGreaterThan(change.before);
  });

  it("moves a rating down when a strong player loses", () => {
    const change = rateMatch({ rating: 90, stats: stats(), outcome: "loss", nightAverage: 0.7 });
    expect(change.delta).toBeLessThan(0);
  });

  it("never swings more than the cap in a single game", () => {
    const monster = rateMatch({
      rating: 65,
      stats: stats({ motmVotes: 10 }),
      outcome: "win",
      wasMotm: true,
    });
    expect(monster.delta).toBeLessThanOrEqual(MAX_SWING);

    const disaster = rateMatch({ rating: 99, stats: stats(), outcome: "loss", nightAverage: 3 });
    expect(disaster.delta).toBeGreaterThanOrEqual(-MAX_SWING);
  });

  it("keeps ratings inside the floor and ceiling", () => {
    const floored = rateMatch({
      rating: RATING_FLOOR,
      stats: stats(),
      outcome: "loss",
      nightAverage: 3,
    });
    expect(floored.after).toBeGreaterThanOrEqual(RATING_FLOOR);

    const capped = rateMatch({
      rating: RATING_CEILING,
      stats: stats({ motmVotes: 5 }),
      outcome: "win",
      wasMotm: true,
    });
    expect(capped.after).toBeLessThanOrEqual(RATING_CEILING);
  });

  it("reports a delta that matches the endpoints it published", () => {
    const change = rateMatch({ rating: 71.4, stats: stats({ goals: 2 }), outcome: "draw" });
    expect(change.after - change.before).toBeCloseTo(change.delta, 5);
  });

  it("ignores self-reported stats entirely", () => {
    const silent = rateMatch({
      rating: STARTING_RATING,
      stats: stats(),
      outcome: "win",
      nightAverage: 0.7,
    });
    const busy = rateMatch({
      rating: STARTING_RATING,
      stats: stats({ goals: 3, headedGoals: 1, assists: 2, nutmegs: 2, tackles: 5, saves: 4 }),
      outcome: "win",
      nightAverage: 0.7,
    });
    expect(silent.delta).toBeGreaterThan(0);
    expect(silent.delta).toBe(busy.delta);
  });

  it("lets a typical loser roughly break even, because turning up matters", () => {
    // A usual night: half the pitch wins, half loses, a handful of votes. The average
    // night score is about 0.7.
    const loser = rateMatch({
      rating: STARTING_RATING,
      stats: stats(),
      outcome: "loss",
      nightAverage: 0.7,
    });
    expect(Math.abs(loser.delta)).toBeLessThan(0.1);
  });

  it("rewards man-of-the-match votes and the award itself", () => {
    const plain = rateMatch({
      rating: STARTING_RATING,
      stats: stats(),
      outcome: "loss",
      nightAverage: 0.7,
    });
    const voted = rateMatch({
      rating: STARTING_RATING,
      stats: stats({ motmVotes: 2 }),
      outcome: "loss",
      nightAverage: 0.7,
    });
    const won = rateMatch({
      rating: STARTING_RATING,
      stats: stats({ motmVotes: 2 }),
      outcome: "loss",
      wasMotm: true,
      nightAverage: 0.7,
    });
    expect(voted.delta).toBeGreaterThan(plain.delta);
    expect(won.delta).toBeGreaterThan(voted.delta);
  });

  it("asks a highly rated player to do more just to stand still", () => {
    const good = rateMatch({ rating: 88, stats: stats(), outcome: "loss", nightAverage: 0.7 });
    const ordinary = rateMatch({
      rating: STARTING_RATING,
      stats: stats(),
      outcome: "loss",
      nightAverage: 0.7,
    });
    expect(good.delta).toBeLessThan(ordinary.delta);
    expect(good.delta).toBeLessThan(0);
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

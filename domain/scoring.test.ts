import { describe, expect, it } from "vitest";
import { agreeScore, describeScore, normalise, outcomeFor, type ScoreReport } from "./scoring";
import type { Side } from "./types";

function report(playerId: string, side: Side, goalsFor: number, goalsAgainst: number): ScoreReport {
  return { playerId, side, goalsFor, goalsAgainst };
}

const NAMES = { a: "Bibs", b: "Skins" } as const;

describe("normalise", () => {
  it("flips a team B report into absolute terms", () => {
    expect(normalise(report("p", "b", 6, 4))).toEqual({ a: 4, b: 6 });
    expect(normalise(report("p", "a", 6, 4))).toEqual({ a: 6, b: 4 });
  });
});

describe("agreeScore", () => {
  it("returns nothing when nobody reported", () => {
    expect(agreeScore([])).toMatchObject({ score: null, total: 0, unanimous: false });
  });

  it("agrees when both sides tell the same story from opposite ends", () => {
    const consensus = agreeScore([
      report("a1", "a", 6, 4),
      report("a2", "a", 6, 4),
      report("b1", "b", 4, 6),
      report("b2", "b", 4, 6),
    ]);
    expect(consensus.score).toEqual({ a: 6, b: 4 });
    expect(consensus.unanimous).toBe(true);
    expect(consensus.agreed).toBe(4);
    expect(consensus.contested).toBe(false);
  });

  it("takes the majority when one player misremembers", () => {
    const consensus = agreeScore([
      report("a1", "a", 5, 3),
      report("a2", "a", 5, 3),
      report("b1", "b", 3, 5),
      report("b2", "b", 4, 5),
    ]);
    expect(consensus.score).toEqual({ a: 5, b: 3 });
    expect(consensus.agreed).toBe(3);
    expect(consensus.total).toBe(4);
    expect(consensus.unanimous).toBe(false);
  });

  it("settles an even split on the scoreline closest to everyone", () => {
    // Two say 5-3, two say 5-5. Both are equally popular; 5-4 is not on the table
    // because only reported scorelines can win, so the tie-break picks whichever
    // reported line sits nearest the whole set.
    const consensus = agreeScore([
      report("a1", "a", 5, 3),
      report("a2", "a", 5, 3),
      report("b1", "b", 5, 5),
      report("b2", "b", 5, 5),
    ]);
    expect(consensus.contested).toBe(true);
    expect(consensus.score).not.toBeNull();
    expect([3, 5]).toContain(consensus.score!.b);
  });

  it("is deterministic when the split is perfectly symmetrical", () => {
    const reports = [
      report("a1", "a", 4, 2),
      report("b1", "b", 3, 3),
    ];
    const first = agreeScore(reports).score;
    const second = agreeScore([...reports].reverse()).score;
    expect(first).toEqual(second);
  });

  it("ignores half-filled reports", () => {
    const consensus = agreeScore([
      report("a1", "a", 2, 1),
      { playerId: "a2", side: "a", goalsFor: 2, goalsAgainst: Number.NaN },
    ]);
    expect(consensus.total).toBe(1);
    expect(consensus.score).toEqual({ a: 2, b: 1 });
  });

  it("handles a single lonely report", () => {
    const consensus = agreeScore([report("b1", "b", 7, 1)]);
    expect(consensus.score).toEqual({ a: 1, b: 7 });
    expect(consensus.unanimous).toBe(true);
  });
});

describe("outcomeFor", () => {
  it("reads the result from each side", () => {
    const score = { a: 3, b: 1 };
    expect(outcomeFor("a", score)).toBe("win");
    expect(outcomeFor("b", score)).toBe("loss");
    expect(outcomeFor("a", { a: 2, b: 2 })).toBe("draw");
  });
});

describe("describeScore", () => {
  it("leads with the winner", () => {
    expect(describeScore(agreeScore([report("b1", "b", 6, 2)]), NAMES)).toBe("Skins 6-2 Bibs.");
    expect(describeScore(agreeScore([report("a1", "a", 6, 2)]), NAMES)).toBe("Bibs 6-2 Skins.");
  });

  it("calls out a draw", () => {
    expect(describeScore(agreeScore([report("a1", "a", 3, 3)]), NAMES)).toContain("Honours even");
  });

  it("admits when the group disagreed", () => {
    const text = describeScore(
      agreeScore([
        report("a1", "a", 5, 3),
        report("a2", "a", 5, 3),
        report("b1", "b", 4, 5),
      ]),
      NAMES,
    );
    expect(text).toContain("2 of 3 agreed");
  });

  it("says so when the score was never settled", () => {
    expect(describeScore(agreeScore([]), NAMES)).toContain("never happened");
  });
});

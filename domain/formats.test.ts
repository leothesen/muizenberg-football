import { describe, expect, it } from "vitest";
import { PLAYABLE_MINIMUM, formatFor, sidesFor } from "./formats";
import { minimumViable } from "./squad";
import type { SquadShape } from "./types";

const SHAPE: SquadShape = { playersPerTeam: 8, subsPerTeam: 3 };

describe("formatFor", () => {
  it("never refuses to play above two people", () => {
    // The point of the whole module. There is no turnout that produces "no game" —
    // the count changes what is played and never whether.
    for (let confirmed = PLAYABLE_MINIMUM; confirmed <= 22; confirmed += 1) {
      expect(formatFor(confirmed, SHAPE).playable, `${confirmed} players`).toBe(
        true,
      );
    }
  });

  it("always has something to say, even to one person", () => {
    for (let confirmed = 0; confirmed <= 22; confirmed += 1) {
      const format = formatFor(confirmed, SHAPE);
      expect(format.label, `${confirmed} players`).not.toBe("");
    }
  });

  it("gives a small turnout a real format and a real instruction", () => {
    expect(formatFor(3, SHAPE)).toMatchObject({
      label: "Rondo",
      playable: true,
      standard: false,
    });
    expect(formatFor(4, SHAPE)).toMatchObject({
      label: "2 v 2",
      standard: false,
    });
    expect(formatFor(6, SHAPE)).toMatchObject({
      label: "3 v 3",
      standard: false,
    });

    // Every stand-in says what to do on arrival — a format nobody can act on is the
    // same as being told the game is off.
    for (const confirmed of [1, 2, 3, 4, 5, 6, 7]) {
      expect(
        formatFor(confirmed, SHAPE).blurb,
        `${confirmed} players`,
      ).not.toBe("");
    }
  });

  it("handles an odd turnout honestly rather than vaguely", () => {
    expect(formatFor(5, SHAPE).label).toBe("3 v 2");
    expect(formatFor(5, SHAPE).blurb).toContain("rotates");
    expect(formatFor(7, SHAPE).label).toBe("4 v 3");
  });

  it("says nothing clever once it is just the normal game", () => {
    const format = formatFor(minimumViable(SHAPE), SHAPE);
    expect(format.standard).toBe(true);
    expect(format.blurb).toBe("");
  });

  it("is not playable below two, because one person is not two teams", () => {
    expect(formatFor(0, SHAPE).playable).toBe(false);
    expect(formatFor(1, SHAPE).playable).toBe(false);

    // But one person is still offered something to do, which is the difference
    // between this and calling it off.
    expect(formatFor(1, SHAPE).blurb).not.toBe("");
  });

  it("flips to the standard game exactly at the league minimum", () => {
    const minimum = minimumViable(SHAPE);
    expect(formatFor(minimum - 1, SHAPE).standard).toBe(false);
    expect(formatFor(minimum, SHAPE).standard).toBe(true);
  });
});

describe("sidesFor", () => {
  it("puts the extra body on the bigger side", () => {
    expect(sidesFor(11)).toEqual({ a: 6, b: 5 });
    expect(sidesFor(10)).toEqual({ a: 5, b: 5 });
    expect(sidesFor(5)).toEqual({ a: 3, b: 2 });
  });

  it("never loses or invents a player", () => {
    for (let confirmed = 0; confirmed <= 30; confirmed += 1) {
      const { a, b } = sidesFor(confirmed);
      expect(a + b, `${confirmed} players`).toBe(confirmed);
      expect(a - b, `${confirmed} players`).toBeLessThanOrEqual(1);
    }
  });
});

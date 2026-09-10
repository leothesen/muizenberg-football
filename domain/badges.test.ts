import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_BADGE_CODES, newBadges, type BadgeContext } from "./badges";
import { EMPTY_STAT_LINE, type MatchStatLine } from "./types";

type CtxOverrides = Partial<Omit<BadgeContext, "match">> & {
  match?: Partial<MatchStatLine>;
};

function ctx(overrides: CtxOverrides = {}): BadgeContext {
  const { match: matchOverrides, ...rest } = overrides;
  return {
    match: { ...EMPTY_STAT_LINE, ...matchOverrides },
    outcome: "draw",
    goalsAgainst: 2,
    selfRating: 6,
    career: { appearances: 10, goals: 5, assists: 3, nutmegs: 2, motmAwards: 1 },
    streak: 1,
    wasMotm: false,
    firstToRespond: false,
    promotedFromWaitlist: false,
    alreadyHeld: new Set<string>(),
    ...rest,
  };
}

describe("catalogue", () => {
  it("only emits codes that exist in the seeded badge catalogue", () => {
    const migration = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "drizzle",
        "0005_badge_catalogue.sql",
      ),
      "utf8",
    );
    const seeded = new Set(
      [...migration.matchAll(/^\s*\('([a-z0-9_]+)',/gm)].map((m) => m[1]!),
    );

    expect(seeded.size).toBeGreaterThan(0);
    for (const code of ALL_BADGE_CODES) {
      expect(seeded.has(code), `badge "${code}" is not in the catalogue migration`).toBe(true);
    }
  });

  it("has no duplicate rules", () => {
    expect(new Set(ALL_BADGE_CODES).size).toBe(ALL_BADGE_CODES.length);
  });
});

describe("turning up", () => {
  it("hands out a debut on the first appearance only", () => {
    const first = newBadges(ctx({ career: { appearances: 1, goals: 0, assists: 0, nutmegs: 0, motmAwards: 0 } }));
    expect(first).toContain("debut");

    const second = newBadges(ctx({ career: { appearances: 2, goals: 0, assists: 0, nutmegs: 0, motmAwards: 0 } }));
    expect(second).not.toContain("debut");
  });

  it("rewards answering the poll first", () => {
    expect(newBadges(ctx({ firstToRespond: true }))).toContain("first_in");
  });

  it("rewards a run of Wednesdays", () => {
    expect(newBadges(ctx({ streak: 5 }))).toContain("streak_5");
    expect(newBadges(ctx({ streak: 4 }))).not.toContain("streak_5");
    expect(newBadges(ctx({ streak: 12 }))).toEqual(expect.arrayContaining(["streak_5", "streak_10"]));
  });

  it("thanks the player who came off the waitlist", () => {
    expect(newBadges(ctx({ promotedFromWaitlist: true }))).toContain("rescuer");
  });
});

describe("performances", () => {
  it("spots a hat-trick and the four-goal haul separately", () => {
    expect(newBadges(ctx({ match: { goals: 3 } }))).toContain("hat_trick");
    const four = newBadges(ctx({ match: { goals: 4 } }));
    expect(four).toEqual(expect.arrayContaining(["hat_trick", "four_goals"]));
  });

  it("awards a full house only when all three happened", () => {
    expect(
      newBadges(ctx({ match: { goals: 1, assists: 1, nutmegs: 1 } })),
    ).toContain("full_house");
    expect(
      newBadges(ctx({ match: { goals: 1, assists: 1 } })),
    ).not.toContain("full_house");
  });

  it("gives a clean sheet only when the score was actually settled", () => {
    expect(newBadges(ctx({ goalsAgainst: 0 }))).toContain("clean_sheet");
    expect(newBadges(ctx({ goalsAgainst: null }))).not.toContain("clean_sheet");
  });

  it("commiserates an own goal", () => {
    expect(newBadges(ctx({ match: { ownGoals: 1 } }))).toContain("own_goal");
  });
});

describe("character", () => {
  it("rewards modesty only when the votes disagreed with it", () => {
    expect(newBadges(ctx({ wasMotm: true, selfRating: 4 }))).toContain("humble");
    expect(newBadges(ctx({ wasMotm: true, selfRating: 9 }))).not.toContain("humble");
    expect(newBadges(ctx({ wasMotm: false, selfRating: 3 }))).not.toContain("humble");
  });

  it("does not guess at humility when nobody rated themselves", () => {
    expect(newBadges(ctx({ wasMotm: true, selfRating: null }))).not.toContain("humble");
  });
});

describe("earning once", () => {
  it("never re-awards something already held", () => {
    const held = new Set(["debut", "first_goal", "hat_trick"]);
    const earned = newBadges(
      ctx({
        match: { goals: 3 },
        career: { appearances: 1, goals: 3, assists: 0, nutmegs: 0, motmAwards: 0 },
        alreadyHeld: held,
      }),
    );
    expect(earned).not.toContain("debut");
    expect(earned).not.toContain("hat_trick");
    expect(earned).not.toContain("first_goal");
  });

  it("returns nothing on a quiet night for an established player", () => {
    expect(
      newBadges(
        ctx({
          alreadyHeld: new Set(["first_goal", "first_assist", "first_nutmeg"]),
          goalsAgainst: 3,
        }),
      ),
    ).toEqual([]);
  });

  it("can award several at once on a big debut", () => {
    const earned = newBadges(
      ctx({
        match: { goals: 4, assists: 3, nutmegs: 3, tackles: 10, saves: 10 },
        career: { appearances: 1, goals: 4, assists: 3, nutmegs: 3, motmAwards: 1 },
        goalsAgainst: 0,
        wasMotm: true,
        selfRating: 5,
        firstToRespond: true,
      }),
    );
    expect(earned.length).toBeGreaterThan(10);
    expect(earned).toEqual(expect.arrayContaining(["debut", "hat_trick", "full_house", "motm"]));
  });
});

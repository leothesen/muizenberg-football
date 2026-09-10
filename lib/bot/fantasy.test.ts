import { describe, expect, it } from "vitest";
import type { CareerStatRow } from "@/domain/records";
import { blankCard, buildPlayerCard, seasonRowFor } from "./fantasy";

function career(overrides: Partial<CareerStatRow> = {}): CareerStatRow {
  return {
    playerId: "p1",
    displayName: "Ann",
    emoji: "🦊",
    appearances: 8,
    goals: 8,
    assists: 4,
    nutmegs: 4,
    tackles: 24,
    saves: 8,
    motmVotes: 4,
    rating: 71,
    ...overrides,
  };
}

describe("buildPlayerCard", () => {
  it("turns career totals into attributes", () => {
    const card = buildPlayerCard({ career: career(), form: [], badges: [] });

    expect(card.displayName).toBe("Ann");
    expect(card.rating).toBe(71);
    expect(card.appearances).toBe(8);
    // A goal a game across eight games is a genuinely good finisher.
    expect(card.attributes.finishing).toBeGreaterThan(60);
  });

  it("regresses a tiny sample towards the middle", () => {
    const loud = buildPlayerCard({
      career: career({ appearances: 1, goals: 4, tackles: 0, saves: 0, motmVotes: 0 }),
      form: [],
      badges: [],
    });
    const proven = buildPlayerCard({
      career: career({ appearances: 20, goals: 80, tackles: 0, saves: 0, motmVotes: 0 }),
      form: [],
      badges: [],
    });

    // Same four-goals-a-game rate, but one of them has actually done it for a season.
    expect(loud.attributes.finishing).toBeLessThan(proven.attributes.finishing);
  });

  it("carries the form window through", () => {
    const card = buildPlayerCard({
      career: career(),
      form: [
        { outcome: "win", delta: 1 },
        { outcome: "loss", delta: -0.2 },
      ],
      badges: [],
    });

    expect(card.form.trend).toBe("rising");
    expect(card.recentOutcomes).toEqual(["win", "loss"]);
  });

  it("caps the badges so a card stays a card", () => {
    const badges = Array.from({ length: 20 }, (_, i) => ({ emoji: "🏅", name: `Badge ${i}` }));
    const card = buildPlayerCard({ career: career(), form: [], badges, badgeLimit: 5 });
    expect(card.badges).toHaveLength(5);
  });
});

describe("blankCard", () => {
  it("gives a debutant neutral attributes rather than zeroes", () => {
    const card = blankCard({ displayName: "New", emoji: "🐣", rating: 65 });

    expect(card.appearances).toBe(0);
    expect(Object.values(card.attributes).every((v) => v === 55)).toBe(true);
    expect(card.form.games).toBe(0);
  });
});

describe("seasonRowFor", () => {
  it("finds a player, or says they have not played", () => {
    const rows = [
      {
        playerId: "p1",
        displayName: "Ann",
        emoji: "🦊",
        rating: 70,
        appearances: 2,
        goals: 1,
        assists: 0,
        nutmegs: 0,
        tackles: 0,
        saves: 0,
        ownGoals: 0,
        motmVotes: 0,
        wins: 1,
        draws: 0,
        losses: 1,
        avgSelfRating: null,
      },
    ];

    expect(seasonRowFor(rows, "p1")?.displayName).toBe("Ann");
    expect(seasonRowFor(rows, "nobody")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { settleFixture, type SettlementContext } from "@/domain/settle";
import { blankCard, buildPlayerCard } from "@/lib/bot/fantasy";
import { MAX_CARD_BADGES } from "./player-card";
import {
  agreementLine,
  MATCH_REPORT_PERFORMERS,
  matchReportProps,
  playerCardProps,
  statLine,
} from "./props";

const KICKOFF = new Date("2026-09-09T16:00:00Z");
const TEAMS = {
  teamA: { name: "Bibs", colour: "hut-yellow" },
  teamB: { name: "Skins", colour: "hut-blue" },
};

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

function squad(size: number) {
  return Array.from({ length: size }, (_, i) => ({
    playerId: `p${i}`,
    displayName: `Player ${i}`,
    emoji: "⚽",
    rating: 65,
    side: (i % 2 === 0 ? "a" : "b") as "a" | "b",
    isSub: false,
  }));
}

function reportsFor(players: ReturnType<typeof squad>, goalsFor: number, goalsAgainst: number) {
  return players.map((p, i) => ({
    playerId: p.playerId,
    goals: i,
    assists: 0,
    nutmegs: 0,
    tackles: 0,
    saves: 0,
    ownGoals: 0,
    selfRating: 7,
    motmVoteFor: null,
    goalsFor: p.side === "a" ? goalsFor : goalsAgainst,
    goalsAgainst: p.side === "a" ? goalsAgainst : goalsFor,
  }));
}

describe("playerCardProps", () => {
  const card = buildPlayerCard({
    career: {
      playerId: "p1",
      displayName: "Ann",
      emoji: "🦊",
      appearances: 8,
      goals: 9,
      assists: 4,
      nutmegs: 3,
      tackles: 20,
      saves: 2,
      motmVotes: 6,
      rating: 74.2,
    },
    form: [
      { outcome: "win", delta: 1 },
      { outcome: "loss", delta: -0.5 },
      { outcome: null, delta: 0.1 },
      { outcome: "draw", delta: 0 },
    ],
    badges: Array.from({ length: 10 }, (_, i) => ({ emoji: "🏅", name: `Badge ${i}` })),
  });

  it("carries the totals through unchanged", () => {
    const props = playerCardProps(card, "Spring 2026");
    expect(props.totals).toEqual({
      goals: 9,
      assists: 4,
      nutmegs: 3,
      tackles: 20,
      saves: 2,
      motmVotes: 6,
    });
    expect(props.rating).toBe(74.2);
  });

  it("shows form oldest to newest, the same way the message does", () => {
    // The card's source is newest-first; a strip that read backwards from the chat
    // message would be the sort of thing nobody notices until somebody does.
    expect(playerCardProps(card, "Spring 2026").form).toEqual(["D", "L", "W"]);
  });

  it("drops games with no agreed score rather than inventing a mark", () => {
    expect(playerCardProps(card, "Spring 2026").form).not.toContain(undefined);
  });

  it("caps badges to what the card can physically fit", () => {
    expect(playerCardProps(card, "Spring 2026").badges).toHaveLength(MAX_CARD_BADGES);
  });

  it("handles a debutant with nothing to show", () => {
    const props = playerCardProps(
      blankCard({ displayName: "New", emoji: "🐣", rating: 65 }),
      "Spring 2026",
    );
    expect(props.appearances).toBe(0);
    expect(props.form).toEqual([]);
    expect(props.badges).toEqual([]);
  });
});

describe("statLine", () => {
  it("names only what happened", () => {
    expect(
      statLine({ goals: 2, assists: 0, nutmegs: 1, tackles: 0, saves: 0, motmVotes: 3 }),
    ).toBe("2 ⚽ · 1 🥜");
  });

  it("separates with a dot, because Satori collapses runs of spaces", () => {
    const line = statLine({ goals: 1, assists: 1, nutmegs: 0, tackles: 0, saves: 0, motmVotes: 0 });
    expect(line).toContain(" · ");
    expect(line).not.toContain("  ");
  });

  it("is empty for somebody who did nothing measurable", () => {
    expect(
      statLine({ goals: 0, assists: 0, nutmegs: 0, tackles: 0, saves: 0, motmVotes: 0 }),
    ).toBe("");
  });
});

describe("agreementLine", () => {
  it("says everybody agreed when they did", () => {
    const players = squad(4);
    const settlement = settleFixture(
      context({ players, reports: reportsFor(players, 5, 3) }),
    );
    expect(agreementLine(settlement)).toBe("Agreed by all 4.");
  });

  it("reports a split", () => {
    const players = squad(4);
    const reports = reportsFor(players, 5, 3);
    reports[0] = { ...reports[0]!, goalsFor: 6 };

    const settlement = settleFixture(context({ players, reports }));
    expect(agreementLine(settlement)).toContain("of 4 agreed");
  });

  it("admits when nobody reported one", () => {
    const players = squad(2);
    const settlement = settleFixture(context({ players }));
    expect(agreementLine(settlement)).toContain("rumour");
  });

  it("says where a replayed score came from", () => {
    const players = squad(2);
    const settlement = settleFixture(
      context({ players, recordedScore: { a: 4, b: 2 } }),
    );
    expect(agreementLine(settlement)).toBe("Score taken from the record.");
  });
});

describe("matchReportProps", () => {
  it("carries the score and caps the performers", () => {
    const players = squad(10);
    const settlement = settleFixture(
      context({ players, reports: reportsFor(players, 7, 4) }),
    );

    const props = matchReportProps(settlement, { kickoffAt: KICKOFF, ...TEAMS });
    expect(props.score).toEqual({ a: 7, b: 4 });
    expect(props.performers.length).toBeLessThanOrEqual(MATCH_REPORT_PERFORMERS);
    expect(props.teamA.name).toBe("Bibs");
  });

  it("passes a missing score through as null rather than zero", () => {
    const players = squad(2);
    const props = matchReportProps(settleFixture(context({ players })), {
      kickoffAt: KICKOFF,
      ...TEAMS,
    });
    expect(props.score).toBeNull();
  });
});

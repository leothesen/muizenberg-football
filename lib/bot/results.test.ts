import { describe, expect, it } from "vitest";
import { settleFixture, type SettlementContext } from "@/domain/settle";
import { buildLeaderboard, ratingTable, type SeasonStatRow } from "@/domain/leaderboards";
import { hallOfFame } from "@/domain/records";
import {
  biggestMovers,
  leaderboardMessage,
  matchReportMessage,
  playerCardMessage,
  recordsMessage,
  tableMessage,
} from "./results";

const KICKOFF = new Date("2026-08-12T16:00:00Z");

// Tiers match the catalogue migration; they decide which badge survives a trim.
const BADGE_NAMES = new Map([
  ["debut", { name: "Debut", emoji: "🐣", tier: "bronze" }],
  ["first_goal", { name: "Off the Mark", emoji: "⚽", tier: "bronze" }],
  ["goals_10", { name: "Double Figures", emoji: "🔟", tier: "silver" }],
  ["hat_trick", { name: "Hat-trick", emoji: "🎩", tier: "gold" }],
  ["clean_sheet", { name: "Clean sheet", emoji: "🧼", tier: "silver" }],
  ["full_house", { name: "Full House", emoji: "🎰", tier: "legendary" }],
]);

const ctx = {
  kickoffAt: KICKOFF,
  teamNames: { a: "Yellows", b: "Blues" } as const,
  badgeNames: BADGE_NAMES,
};

function settlementContext(overrides: Partial<SettlementContext> = {}): SettlementContext {
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

const veteran = { appearances: 20, goals: 20, assists: 10, nutmegs: 20, motmAwards: 3 };

function playedMatch() {
  return settleFixture(
    settlementContext({
      players: [
        { playerId: "ann", displayName: "Ann", emoji: "🦊", rating: 70, side: "a", isSub: false },
        { playerId: "bob", displayName: "Bob", emoji: "🐻", rating: 64, side: "b", isSub: false },
        { playerId: "cat", displayName: "Cat", emoji: "🐱", rating: 66, side: "b", isSub: true },
      ],
      reports: [
        {
          playerId: "ann",
          goals: 3,
          assists: 1,
          nutmegs: 0,
          tackles: 2,
          saves: 0,
          ownGoals: 0,
          selfRating: 8,
          motmVoteFor: "bob",
          goalsFor: 5,
          goalsAgainst: 2,
        },
        {
          playerId: "bob",
          goals: 1,
          assists: 0,
          nutmegs: 2,
          tackles: 6,
          saves: 3,
          ownGoals: 0,
          selfRating: 6,
          motmVoteFor: "ann",
          goalsFor: 2,
          goalsAgainst: 5,
        },
        {
          playerId: "cat",
          goals: 1,
          assists: 0,
          nutmegs: 0,
          tackles: 1,
          saves: 0,
          ownGoals: 0,
          selfRating: 5,
          motmVoteFor: "ann",
          goalsFor: 2,
          goalsAgainst: 5,
        },
      ],
      careerBefore: new Map([
        ["ann", veteran],
        ["bob", veteran],
        ["cat", veteran],
      ]),
    }),
  );
}

describe("matchReportMessage", () => {
  it("leads with the score and names the man of the match", () => {
    const message = matchReportMessage(playedMatch(), ctx);

    expect(message).toContain("Yellows 5-2 Blues");
    expect(message).toContain("Man of the match");
    expect(message).toContain("Ann");
  });

  it("lists the team of the week best first", () => {
    const message = matchReportMessage(playedMatch(), ctx);
    const totw = message.slice(message.indexOf("Team of the week"));

    expect(totw.indexOf("Ann")).toBeLessThan(totw.indexOf("Cat"));
    // Named, not just pictured. Everybody reads ⚽; almost nobody reads 🥜 as a
    // nutmeg, and a stat somebody has to decode is a stat they skip — which wastes
    // the point of having asked them nine questions after the game.
    expect(totw).toContain("⚽ 3 goals");
  });

  it("says so plainly when nobody filed anything", () => {
    const settlement = settleFixture(
      settlementContext({
        players: [
          { playerId: "ann", displayName: "Ann", emoji: "🦊", rating: 70, side: "a", isSub: false },
        ],
      }),
    );

    const message = matchReportMessage(settlement, ctx);
    expect(message).toContain("going down as a rumour");
    expect(message).not.toContain("Team of the week");
  });

  it("chases the people who never answered", () => {
    const settlement = settleFixture(
      settlementContext({
        players: [
          { playerId: "ann", displayName: "Ann", emoji: "🦊", rating: 70, side: "a", isSub: false },
          { playerId: "shy", displayName: "Shy", emoji: "🐭", rating: 65, side: "b", isSub: false },
        ],
        reports: [
          {
            playerId: "ann",
            goals: 1,
            assists: 0,
            nutmegs: 0,
            tackles: 0,
            saves: 0,
            ownGoals: 0,
            selfRating: 7,
            motmVoteFor: null,
            goalsFor: 1,
            goalsAgainst: 0,
          },
        ],
        careerBefore: new Map([
          ["ann", veteran],
          ["shy", veteran],
        ]),
      }),
    );

    expect(matchReportMessage(settlement, ctx)).toContain("1 person never answered");
  });

  it("names the badges people unlocked", () => {
    const settlement = settleFixture(
      settlementContext({
        players: [
          { playerId: "ann", displayName: "Ann", emoji: "🦊", rating: 70, side: "a", isSub: false },
        ],
        reports: [
          {
            playerId: "ann",
            goals: 3,
            assists: 0,
            nutmegs: 0,
            tackles: 0,
            saves: 0,
            ownGoals: 0,
            selfRating: 9,
            motmVoteFor: null,
            goalsFor: 3,
            goalsAgainst: 0,
          },
        ],
        careerBefore: new Map([["ann", veteran]]),
      }),
    );

    const message = matchReportMessage(settlement, ctx);
    // Six badges at once, trimmed to three — the rarest ones survive.
    expect(message).toContain("Hat-trick");
    expect(message).toContain("Clean sheet");
    expect(message).not.toContain("Off the Mark");
  });

  it("states a recorded score flatly, without claiming a consensus that never happened", () => {
    const settlement = settleFixture(
      settlementContext({
        players: [
          { playerId: "ann", displayName: "Ann", emoji: "🦊", rating: 70, side: "a", isSub: false },
          { playerId: "bob", displayName: "Bob", emoji: "🐻", rating: 65, side: "b", isSub: false },
        ],
        reports: [
          {
            playerId: "ann",
            goals: 2,
            assists: 0,
            nutmegs: 0,
            tackles: 0,
            saves: 0,
            ownGoals: 0,
            selfRating: 7,
            motmVoteFor: null,
            goalsFor: null,
            goalsAgainst: null,
          },
        ],
        careerBefore: new Map([
          ["ann", veteran],
          ["bob", veteran],
        ]),
        recordedScore: { a: 8, b: 3 },
      }),
    );

    const message = matchReportMessage(settlement, ctx);
    expect(message).toContain("Yellows 8-3 Blues");
    expect(message).not.toContain("agreed");
  });

  it("trims the badge roll-call rather than burying the football", () => {
    // A week where a milestone lands for everybody: eleven badge lines would push the
    // score and the team of the week off the top of the message.
    const squad = Array.from({ length: 11 }, (_, i) => ({
      playerId: `p${i}`,
      displayName: `Player ${i}`,
      emoji: "⚽",
      rating: 65,
      side: (i % 2 === 0 ? "a" : "b") as "a" | "b",
      isSub: false,
    }));

    const settlement = settleFixture(
      settlementContext({
        players: squad,
        reports: squad.map((p) => ({
          playerId: p.playerId,
          goals: 1,
          assists: 0,
          nutmegs: 0,
          tackles: 0,
          saves: 0,
          ownGoals: 0,
          selfRating: 7,
          motmVoteFor: null,
          goalsFor: 3,
          goalsAgainst: 3,
        })),
        // Everyone is on a four-game run going in, so everyone hits five tonight.
        streakBefore: new Map(squad.map((p) => [p.playerId, 4])),
        careerBefore: new Map(squad.map((p) => [p.playerId, veteran])),
      }),
    );

    const message = matchReportMessage(settlement, {
      ...ctx,
      badgeNames: new Map([["streak_5", { name: "Ever Present", emoji: "📅", tier: "silver" }]]),
    });

    const badgeLineCount = message
      .split("\n")
      .filter((line) => line.includes("Ever Present")).length;

    expect(badgeLineCount).toBeLessThanOrEqual(5);
    expect(message).toContain("picked something up");
    expect(message).toContain("Team of the week");
  });

  it("escapes a display name that is trying to be HTML", () => {
    const settlement = settleFixture(
      settlementContext({
        players: [
          {
            playerId: "x",
            displayName: "<b>boss</b>",
            emoji: "😈",
            rating: 65,
            side: "a",
            isSub: false,
          },
        ],
        reports: [
          {
            playerId: "x",
            goals: 1,
            assists: 0,
            nutmegs: 0,
            tackles: 0,
            saves: 0,
            ownGoals: 0,
            selfRating: 7,
            motmVoteFor: null,
            goalsFor: 1,
            goalsAgainst: 1,
          },
        ],
        careerBefore: new Map([["x", veteran]]),
      }),
    );

    const message = matchReportMessage(settlement, ctx);
    expect(message).toContain("&lt;b&gt;boss&lt;/b&gt;");
    expect(message).not.toContain("<b>boss</b>");
    // The escaping happens once, not twice.
    expect(message).not.toContain("&amp;lt;");
  });
});

describe("biggestMovers", () => {
  it("takes the top risers and a single faller", () => {
    const movers = biggestMovers(playedMatch().players);
    expect(movers.length).toBeGreaterThan(0);
    expect(movers.length).toBeLessThanOrEqual(3);
  });

  it("never lists the same player twice", () => {
    const players = playedMatch().players;
    const ids = biggestMovers(players).map((p) => p.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

function seasonRow(overrides: Partial<SeasonStatRow> & { playerId: string }): SeasonStatRow {
  return {
    displayName: overrides.playerId,
    emoji: "⚽",
    rating: 65,
    appearances: 4,
    goals: 0,
    assists: 0,
    nutmegs: 0,
    tackles: 0,
    saves: 0,
    ownGoals: 0,
    motmVotes: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    avgSelfRating: null,
    ...overrides,
  };
}

describe("tableMessage", () => {
  it("renders the table with medals at the top", () => {
    const message = tableMessage(
      ratingTable([
        seasonRow({ playerId: "ann", displayName: "Ann", rating: 72, wins: 3, goals: 5 }),
        seasonRow({ playerId: "bob", displayName: "Bob", rating: 61 }),
      ]),
      "Spring 2026",
    );

    expect(message).toContain("🥇");
    expect(message).toContain("Ann");
    expect(message).toContain("72.0");
    expect(message).toContain("3W 0D 0L");
  });

  it("has something to say before anyone has played", () => {
    expect(tableMessage([], "Spring 2026")).toContain("starts with the first game");
  });
});

describe("leaderboardMessage", () => {
  it("skips boards nobody is on", () => {
    const boards = [
      buildLeaderboard("goldenBoot", [seasonRow({ playerId: "ann", displayName: "Ann", goals: 4 })]),
      buildLeaderboard("theGloves", [seasonRow({ playerId: "ann" })]),
    ];

    const message = leaderboardMessage(boards);
    expect(message).toContain("Golden Boot");
    expect(message).not.toContain("The Gloves");
  });

  it("uses the singular for a lone goal", () => {
    const boards = [
      buildLeaderboard("goldenBoot", [seasonRow({ playerId: "ann", displayName: "Ann", goals: 1 })]),
    ];
    expect(leaderboardMessage(boards)).toContain("1 goal ");
  });

  it("says nothing has happened yet when every board is empty", () => {
    expect(leaderboardMessage([buildLeaderboard("goldenBoot", [])])).toContain("Nothing to show");
  });
});

describe("playerCardMessage", () => {
  it("shows the rating, the attributes and the form strip", () => {
    const message = playerCardMessage({
      displayName: "Ann",
      emoji: "🦊",
      rating: 71.4,
      appearances: 6,
      attributes: {
        finishing: 80,
        vision: 62,
        flair: 71,
        defending: 55,
        keeping: 48,
        reputation: 66,
      },
      form: { swing: 1.4, trend: "rising", games: 3 },
      recentOutcomes: ["win", "draw", "loss"],
      goals: 7,
      assists: 3,
      nutmegs: 4,
      tackles: 12,
      saves: 2,
      motmVotes: 5,
      badges: [{ emoji: "🎩", name: "Hat-trick" }],
    });

    expect(message).toContain("71.4");
    expect(message).toContain("FIN 80");
    expect(message).toContain("🟢");
    expect(message).toContain("on the up");
    expect(message).toContain("Hat-trick");
  });

  it("leaves out the form line for somebody with no results", () => {
    const message = playerCardMessage({
      displayName: "New",
      emoji: "🐣",
      rating: 65,
      appearances: 0,
      attributes: {
        finishing: 55,
        vision: 55,
        flair: 55,
        defending: 55,
        keeping: 55,
        reputation: 55,
      },
      form: { swing: 0, trend: "steady", games: 0 },
      recentOutcomes: [],
      goals: 0,
      assists: 0,
      nutmegs: 0,
      tackles: 0,
      saves: 0,
      motmVotes: 0,
      badges: [],
    });

    expect(message).not.toContain("Form");
    expect(message).toContain("0 games played");
  });
});

describe("recordsMessage", () => {
  it("renders each kind of record", () => {
    const fame = hallOfFame(
      [
        {
          playerId: "ann",
          displayName: "Ann",
          emoji: "🦊",
          fixtureId: "w1",
          kickoffAt: KICKOFF,
          goals: 4,
          assists: 0,
          nutmegs: 0,
          tackles: 0,
          saves: 0,
          motmVotes: 0,
          outcome: "win",
          goalsFor: 9,
          goalsAgainst: 1,
        },
      ],
      [
        {
          playerId: "ann",
          displayName: "Ann",
          emoji: "🦊",
          appearances: 6,
          goals: 12,
          assists: 4,
          nutmegs: 3,
          tackles: 10,
          saves: 1,
          motmVotes: 5,
          rating: 72,
        },
      ],
    );

    const message = recordsMessage(fame, {
      holders: [{ playerId: "ann", displayName: "Ann", emoji: "🦊" }],
      length: 6,
    });

    expect(message).toContain("Most goals in a game");
    expect(message).toContain("Most goals ever");
    expect(message).toContain("Biggest win");
    expect(message).toContain("Longest run");
  });

  it("collapses a record half the league shares into a count", () => {
    const holders = Array.from({ length: 12 }, (_, i) => ({
      playerId: `p${i}`,
      displayName: `Player ${i}`,
      emoji: "⚽",
    }));

    const message = recordsMessage(
      {
        singleGame: [
          {
            key: "most_assists_game",
            title: "Most assists in a game",
            emoji: "🎁",
            value: 2,
            unit: "assists",
            holders,
            achievedAt: KICKOFF,
          },
        ],
        career: [],
        matches: [],
      },
      null,
    );

    expect(message).toContain("Player 0");
    expect(message).toContain("9 others");
    expect(message).not.toContain("Player 11");
    // One "and", not two.
    expect(message).toContain("Player 2 and 9 others");
  });

  it("admits when there is nothing in it", () => {
    expect(recordsMessage({ singleGame: [], career: [], matches: [] }, null)).toContain("Empty");
  });
});

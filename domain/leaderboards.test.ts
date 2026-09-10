import { describe, expect, it } from "vitest";
import {
  allLeaderboards,
  buildLeaderboard,
  formStrip,
  formSummary,
  LEADERBOARDS,
  ratingTable,
  seasonAwards,
  type SeasonStatRow,
} from "./leaderboards";

function row(overrides: Partial<SeasonStatRow> & { playerId: string }): SeasonStatRow {
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

describe("buildLeaderboard", () => {
  it("orders by value and numbers the ranks", () => {
    const board = buildLeaderboard("goldenBoot", [
      row({ playerId: "ann", goals: 3 }),
      row({ playerId: "bob", goals: 9 }),
      row({ playerId: "cat", goals: 5 }),
    ]);

    expect(board.entries.map((e) => [e.rank, e.playerId])).toEqual([
      [1, "bob"],
      [2, "cat"],
      [3, "ann"],
    ]);
  });

  it("shares a rank between players on the same total and skips the next one", () => {
    const board = buildLeaderboard("goldenBoot", [
      row({ playerId: "ann", displayName: "Ann", goals: 5, appearances: 4 }),
      row({ playerId: "bob", displayName: "Bob", goals: 5, appearances: 4 }),
      row({ playerId: "cat", displayName: "Cat", goals: 2 }),
    ]);

    expect(board.entries.map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  it("puts whoever did it in fewer games first when totals tie", () => {
    const board = buildLeaderboard("goldenBoot", [
      row({ playerId: "plodder", goals: 6, appearances: 12 }),
      row({ playerId: "sharp", goals: 6, appearances: 3 }),
    ]);

    expect(board.entries[0]?.playerId).toBe("sharp");
    // Still the same rank, because the total is what the award is for.
    expect(board.entries.map((e) => e.rank)).toEqual([1, 1]);
  });

  it("leaves out players who have not done the thing at all", () => {
    const board = buildLeaderboard("nutmegKing", [
      row({ playerId: "ann", nutmegs: 2 }),
      row({ playerId: "bob", nutmegs: 0 }),
    ]);

    expect(board.entries).toHaveLength(1);
    expect(board.empty).toBe(false);
  });

  it("reports an empty board rather than inventing a winner", () => {
    const board = buildLeaderboard("theGloves", [row({ playerId: "ann" })]);
    expect(board.empty).toBe(true);
    expect(board.entries).toEqual([]);
  });

  it("truncates to the requested length", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ playerId: `p${i}`, goals: 10 - i }),
    );
    expect(buildLeaderboard("goldenBoot", rows, 3).entries).toHaveLength(3);
  });

  it("shows a per-game detail on the volume boards", () => {
    const board = buildLeaderboard("goldenBoot", [
      row({ playerId: "ann", goals: 8, appearances: 4 }),
    ]);
    expect(board.entries[0]?.detail).toBe("2.0 a game");
  });

  it("is stable regardless of the order rows arrive in", () => {
    const rows = [
      row({ playerId: "ann", displayName: "Ann", goals: 4 }),
      row({ playerId: "bob", displayName: "Bob", goals: 4 }),
    ];
    const forwards = buildLeaderboard("goldenBoot", rows).entries.map((e) => e.playerId);
    const backwards = buildLeaderboard("goldenBoot", [...rows].reverse()).entries.map(
      (e) => e.playerId,
    );
    expect(forwards).toEqual(backwards);
  });

  it("covers every board it advertises", () => {
    const boards = allLeaderboards([row({ playerId: "ann", goals: 1 })]);
    expect(boards.map((b) => b.key)).toEqual(LEADERBOARDS.map((d) => d.key));
  });
});

describe("seasonAwards", () => {
  it("names the winner of each board that has one", () => {
    const awards = seasonAwards([
      row({ playerId: "ann", displayName: "Ann", goals: 7, appearances: 5 }),
      row({ playerId: "bob", displayName: "Bob", assists: 4, appearances: 5 }),
    ]);

    const boot = awards.find((a) => a.key === "goldenBoot");
    expect(boot?.winners.map((w) => w.displayName)).toEqual(["Ann"]);
    expect(boot?.value).toBe(7);
    expect(boot?.unit).toBe("goals");

    // Nobody has a save, so The Gloves is not handed out at all.
    expect(awards.map((a) => a.key)).not.toContain("theGloves");
  });

  it("keeps both names when an award is shared", () => {
    const awards = seasonAwards([
      row({ playerId: "ann", displayName: "Ann", nutmegs: 3, appearances: 4 }),
      row({ playerId: "bob", displayName: "Bob", nutmegs: 3, appearances: 4 }),
    ]);

    expect(awards.find((a) => a.key === "nutmegKing")?.winners).toHaveLength(2);
  });

  it("uses the singular when somebody has won it with one", () => {
    const awards = seasonAwards([row({ playerId: "ann", goals: 1 })]);
    expect(awards.find((a) => a.key === "goldenBoot")?.unit).toBe("goal");
  });
});

describe("ratingTable", () => {
  it("ranks on rating, highest first", () => {
    const table = ratingTable([
      row({ playerId: "ann", rating: 68.2 }),
      row({ playerId: "bob", rating: 71.9 }),
      row({ playerId: "cat", rating: 64.1 }),
    ]);

    expect(table.map((t) => t.playerId)).toEqual(["bob", "ann", "cat"]);
    expect(table.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  it("leaves out anyone who has not played yet", () => {
    const table = ratingTable([
      row({ playerId: "ann", rating: 70, appearances: 2 }),
      row({ playerId: "ghost", rating: 99, appearances: 0 }),
    ]);

    expect(table.map((t) => t.playerId)).toEqual(["ann"]);
  });

  it("breaks a tie on appearances then name", () => {
    const table = ratingTable([
      row({ playerId: "b", displayName: "B", rating: 70, appearances: 3 }),
      row({ playerId: "a", displayName: "A", rating: 70, appearances: 3 }),
      row({ playerId: "c", displayName: "C", rating: 70, appearances: 6 }),
    ]);

    expect(table.map((t) => t.displayName)).toEqual(["C", "A", "B"]);
  });
});

describe("form", () => {
  it("reads oldest to newest, so the latest result is on the right", () => {
    expect(formStrip(["win", "loss", "win"])).toBe("🟢🔴🟢");
  });

  it("drops games that never got a score rather than faking one", () => {
    expect(formStrip(["win", null, "draw"])).toBe("⚪🟢");
  });

  it("keeps only the requested window", () => {
    expect(formStrip(["win", "win", "win", "win", "win", "loss"], 5)).toBe("🟢🟢🟢🟢🟢");
  });

  it("is empty with nothing to show", () => {
    expect(formStrip([])).toBe("");
  });

  it("calls a run of gains rising and a run of losses falling", () => {
    expect(formSummary([1.2, 0.4]).trend).toBe("rising");
    expect(formSummary([-1.2, -0.4]).trend).toBe("falling");
    expect(formSummary([0.2, -0.1]).trend).toBe("steady");
  });

  it("sums only the window it was given", () => {
    expect(formSummary([1, 1, 1, 1, 1, 1], 5)).toMatchObject({ swing: 5, games: 5 });
  });
});

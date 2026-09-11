import { describe, expect, it } from "vitest";
import { STAT_KINDS, statChip, statGrid, statSummary } from "./stats";

describe("statChip", () => {
  it("names the thing as well as picturing it", () => {
    // The whole reason this module exists. `1🥜` is a number beside a peanut.
    expect(statChip(STAT_KINDS[2]!, 1)).toBe("🥜 1 nutmeg");
  });

  it("gets the plural right", () => {
    expect(statChip(STAT_KINDS[0]!, 1)).toBe("⚽ 1 goal");
    expect(statChip(STAT_KINDS[0]!, 3)).toBe("⚽ 3 goals");
    expect(statChip(STAT_KINDS[0]!, 0)).toBe("⚽ 0 goals");
  });
});

describe("statSummary", () => {
  it("lists only what happened", () => {
    // A line of six noughts says nothing about a player and buries the one number
    // that does.
    expect(statSummary({ goals: 2, assists: 0, nutmegs: 1 })).toBe(
      "⚽ 2 goals · 🥜 1 nutmeg",
    );
  });

  it("is empty for somebody who did none of it", () => {
    expect(statSummary({})).toBe("");
    expect(statSummary({ goals: 0, saves: 0 })).toBe("");
  });

  it("keeps the same order however the counts arrive", () => {
    const summary = statSummary({ saves: 1, goals: 1, motmVotes: 1 });
    expect(summary.indexOf("goal")).toBeLessThan(summary.indexOf("save"));
    expect(summary.indexOf("save")).toBeLessThan(summary.indexOf("MOTM"));
  });
});

describe("statGrid", () => {
  const all = { goals: 3, assists: 2, nutmegs: 1, tackles: 4, saves: 0, motmVotes: 2 };

  it("shows every stat, including the empty ones", () => {
    // A striker with no saves should see that. Next week's card only means something
    // if you know what it is counting.
    const rows = statGrid(all);
    expect(rows.join(" ")).toContain("🧤 0 saves");
  });

  it("comes back as two rows, because six labelled stats do not fit across a phone", () => {
    const rows = statGrid(all);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.split("   ")).toHaveLength(3);
  });

  it("covers the whole list, so adding a stat cannot silently drop it", () => {
    const rows = statGrid(all);
    for (const kind of STAT_KINDS) {
      expect(rows.join(" "), kind.key).toContain(kind.emoji);
    }
  });
});

import { describe, expect, it } from "vitest";
import { TEAM_COLOURS } from "@/lib/og/theme";
import { balanceTeams, pickTeams } from "./teams";
import type { Commitment, PlayerLike, SquadShape } from "./types";

const SHAPE: SquadShape = { playersPerTeam: 8, subsPerTeam: 3 };

function player(id: string, rating: number): PlayerLike {
  return { id, displayName: id, emoji: "⚽", rating };
}

function commit(players: PlayerLike[]): Commitment[] {
  const base = new Date("2026-09-08T12:00:00Z").getTime();
  return players.map((p, i) => ({ player: p, inSince: new Date(base + i * 60_000) }));
}

const total = (ps: PlayerLike[]) => ps.reduce((s, p) => s + p.rating, 0);

describe("balanceTeams", () => {
  it("splits a lopsided group into near-equal sides", () => {
    const players = [
      player("a", 90),
      player("b", 88),
      player("c", 70),
      player("d", 68),
      player("e", 55),
      player("f", 52),
    ];
    const { a, b } = balanceTeams(players);
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    expect(Math.abs(total(a) - total(b))).toBeLessThanOrEqual(3);
  });

  it("is deterministic regardless of input order", () => {
    const players = [
      player("a", 91),
      player("b", 77),
      player("c", 64),
      player("d", 83),
      player("e", 58),
      player("f", 72),
      player("g", 69),
      player("h", 60),
    ];
    const first = balanceTeams(players);
    const second = balanceTeams([...players].reverse());
    expect(first.a.map((p) => p.id).sort()).toEqual(second.a.map((p) => p.id).sort());
  });

  it("balances purely on rating, since the league has no positions", () => {
    const players = [player("a", 90), player("b", 70), player("c", 70), player("d", 50)];
    const { a, b } = balanceTeams(players);
    const total = (t: PlayerLike[]) => t.reduce((s, p) => s + p.rating, 0);
    // 90+50 against 70+70 is the only even split available.
    expect(total(a)).toBe(140);
    expect(total(b)).toBe(140);
  });

  it("handles an odd turnout by giving one side the extra player", () => {
    const players = Array.from({ length: 15 }, (_, i) => player(`p${i}`, 50 + i * 3));
    const { a, b } = balanceTeams(players);
    expect(Math.abs(a.length - b.length)).toBe(1);
    expect(a.length + b.length).toBe(15);
  });

  it("keeps every player exactly once", () => {
    const players = Array.from({ length: 22 }, (_, i) => player(`p${i}`, 40 + i * 2));
    const { a, b } = balanceTeams(players);
    const ids = [...a, ...b].map((p) => p.id).sort();
    expect(new Set(ids).size).toBe(22);
    expect(ids).toEqual(players.map((p) => p.id).sort());
  });
});

describe("pickTeams", () => {
  it("benches the last to commit, not the worst players", () => {
    // The two weakest players answered first, so they must start.
    const players = [
      player("early_weak_1", 45),
      player("early_weak_2", 46),
      ...Array.from({ length: 18 }, (_, i) => player(`mid${i}`, 65 + (i % 5))),
      player("late_star_1", 95),
      player("late_star_2", 94),
    ];
    const picked = pickTeams(commit(players), SHAPE);
    const allSubs = [...picked.a.subs, ...picked.b.subs].map((p) => p.id);

    expect(allSubs).not.toContain("early_weak_1");
    expect(allSubs).not.toContain("early_weak_2");
    expect(allSubs).toContain("late_star_1");
    expect(allSubs).toContain("late_star_2");
  });

  it("starts everybody when the turnout is thin", () => {
    const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`, 60 + i));
    const picked = pickTeams(commit(players), SHAPE);
    expect(picked.a.subs).toHaveLength(0);
    expect(picked.b.subs).toHaveLength(0);
    expect(picked.a.starters.length + picked.b.starters.length).toBe(10);
  });

  it("keeps the sides close together", () => {
    const players = Array.from({ length: 22 }, (_, i) => player(`p${i}`, 45 + ((i * 7) % 45)));
    const picked = pickTeams(commit(players), SHAPE);
    // Per player, not a total: under a rating point apart on an even turnout.
    expect(picked.ratingGap).toBeLessThan(1);
  });

  it("stays fair on an odd turnout, where totals would be misleading", () => {
    // Eleven players means 6 against 5. Comparing total rating would report a gap of
    // roughly a whole player for two perfectly matched sides; averages must not.
    const players = Array.from({ length: 11 }, (_, i) => player(`p${i}`, 60 + i * 2));
    const picked = pickTeams(commit(players), SHAPE);

    const sizeA = picked.a.starters.length + picked.a.subs.length;
    const sizeB = picked.b.starters.length + picked.b.subs.length;
    expect(Math.abs(sizeA - sizeB)).toBe(1);
    expect(picked.ratingGap).toBeLessThan(2);
  });

  it("only selects up to capacity, ignoring the waitlist", () => {
    const players = Array.from({ length: 26 }, (_, i) => player(`p${String(i).padStart(2, "0")}`, 65));
    const picked = pickTeams(commit(players), SHAPE);
    const selected = [
      ...picked.a.starters,
      ...picked.a.subs,
      ...picked.b.starters,
      ...picked.b.subs,
    ];
    expect(selected).toHaveLength(22);
    expect(selected.map((p) => p.id)).not.toContain("p22");
  });

  it("names the sides after the shirts the group actually owns", () => {
    const picked = pickTeams(commit(Array.from({ length: 10 }, (_, i) => player(`p${i}`, 65))), SHAPE);
    expect(picked.a.name).toBe("Black");
    expect(picked.b.name).toBe("White");
    expect(picked.a.colour).not.toBe(picked.b.colour);
  });

  it("gives each side a colour the images know how to draw", () => {
    // An unknown token is not an error anywhere — teamColour falls back to green —
    // so a typo here would silently paint both teams the same and the team sheet
    // would stop telling anybody which shirt to wear.
    const picked = pickTeams(commit(Array.from({ length: 10 }, (_, i) => player(`p${i}`, 65))), SHAPE);

    expect(TEAM_COLOURS[picked.a.colour]).toBeDefined();
    expect(TEAM_COLOURS[picked.b.colour]).toBeDefined();
    expect(TEAM_COLOURS[picked.a.colour]).not.toBe(TEAM_COLOURS[picked.b.colour]);
  });
});

import { describe, expect, it } from "vitest";
import { balanceTeams, pickTeams } from "./teams";
import type { Commitment, PlayerLike, Position, SquadShape } from "./types";

const SHAPE: SquadShape = { playersPerTeam: 8, subsPerTeam: 3 };

function player(id: string, rating: number, preferredPosition: Position = "anywhere"): PlayerLike {
  return { id, displayName: id, emoji: "⚽", rating, preferredPosition };
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

  it("gives each side a keeper when two are available", () => {
    const players = [
      player("keeper1", 70, "gk"),
      player("keeper2", 66, "gk"),
      player("c", 80),
      player("d", 60),
      player("e", 75),
      player("f", 65),
    ];
    const { a, b } = balanceTeams(players);
    const keepersIn = (t: PlayerLike[]) => t.filter((p) => p.preferredPosition === "gk").length;
    expect(keepersIn(a)).toBe(1);
    expect(keepersIn(b)).toBe(1);
  });

  it("never leaves a keeper stranded when only one turns up", () => {
    const players = [
      player("keeper1", 70, "gk"),
      player("c", 80),
      player("d", 60),
      player("e", 75),
    ];
    const { a, b } = balanceTeams(players);
    const keepers = [...a, ...b].filter((p) => p.preferredPosition === "gk");
    expect(keepers).toHaveLength(1);
    expect(a.length + b.length).toBe(4);
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
    expect(picked.ratingGap).toBeLessThanOrEqual(4);
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

  it("names and colours the sides for the team sheet", () => {
    const picked = pickTeams(commit(Array.from({ length: 10 }, (_, i) => player(`p${i}`, 65))), SHAPE);
    expect(picked.a.name).toBe("Bibs");
    expect(picked.b.name).toBe("Skins");
    expect(picked.a.colour).not.toBe(picked.b.colour);
  });
});

import { describe, expect, it } from "vitest";
import { pickTeams } from "@/domain/teams";
import type { Commitment, PlayerLike } from "@/domain/types";
import { notEnoughPlayersMessage, teamSheetMessage } from "./team-sheet";

const KICKOFF = new Date("2026-09-16T16:00:00Z");
const SHAPE = { playersPerTeam: 8, subsPerTeam: 3 };

function player(id: string, rating = 65, displayName = id): PlayerLike {
  return { id, displayName, emoji: "⚽", rating };
}

function commit(players: PlayerLike[]): Commitment[] {
  const base = new Date("2026-09-15T14:00:00Z").getTime();
  return players.map((p, i) => ({ player: p, inSince: new Date(base + i * 60_000) }));
}

describe("teamSheetMessage", () => {
  it("names both sides with their colours", () => {
    const teams = pickTeams(commit(Array.from({ length: 10 }, (_, i) => player(`p${i}`))), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });

    expect(text).toContain("Bibs");
    expect(text).toContain("Skins");
    expect(text).toContain("🟡");
    expect(text).toContain("🔵");
  });

  it("shows the kickoff in league time", () => {
    const teams = pickTeams(commit([player("a"), player("b")]), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });
    expect(text).toContain("Wednesday 16 September, 18:00");
  });

  it("explains why somebody is a sub, so it does not read as a demotion", () => {
    const players = Array.from({ length: 22 }, (_, i) => player(`p${String(i).padStart(2, "0")}`));
    const teams = pickTeams(commit(players), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });

    expect(text).toContain("Subs:");
    expect(text).toContain("answered last, not whoever is worst");
  });

  it("says nothing about subs when everybody starts", () => {
    const teams = pickTeams(commit(Array.from({ length: 8 }, (_, i) => player(`p${i}`))), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });
    expect(text).not.toContain("Subs:");
    expect(text).not.toContain("answered last");
  });

  it("describes a dead-even split without a meaningless decimal", () => {
    const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`, 65));
    const teams = pickTeams(commit(players), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });
    expect(text).toContain("Dead even on paper");
  });

  it("owns up when the sides are genuinely lopsided", () => {
    // One superstar and nine journeymen cannot be balanced.
    const players = [player("star", 99), ...Array.from({ length: 9 }, (_, i) => player(`p${i}`, 45))];
    const teams = pickTeams(commit(players), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });
    expect(text).toContain("head start");
  });

  it("calls out uneven numbers so somebody rotates", () => {
    const players = Array.from({ length: 11 }, (_, i) => player(`p${i}`));
    const teams = pickTeams(commit(players), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });
    expect(text).toContain("6 against 5");
    expect(text).toContain("Rotate someone through");
  });

  it("says nothing about numbers when the sides are even", () => {
    const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
    const teams = pickTeams(commit(players), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });
    expect(text).not.toContain("Uneven numbers");
  });

  it("escapes hostile display names", () => {
    const teams = pickTeams(commit([player("x", 65, "<b>hax</b>"), player("y")]), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });
    expect(text).not.toContain("<b>hax</b>");
    expect(text).toContain("&lt;b&gt;hax&lt;/b&gt;");
  });
});

describe("notEnoughPlayersMessage", () => {
  it("says what went wrong and what to do about it", () => {
    const text = notEnoughPlayersMessage({ confirmed: 5, needed: 8, kickoffAt: KICKOFF });
    expect(text).toContain("Called off");
    expect(text).toContain("Only 5 people");
    expect(text).toContain("we need 8");
    expect(text).toContain("Answer the poll early");
  });

  it("uses the singular for a lonely turnout", () => {
    expect(notEnoughPlayersMessage({ confirmed: 1, needed: 8, kickoffAt: KICKOFF })).toContain(
      "Only 1 person",
    );
  });
});

import { describe, expect, it } from "vitest";
import { pickTeams } from "@/domain/teams";
import type { Commitment, PlayerLike } from "@/domain/types";
import { formatFor } from "@/domain/formats";
import { teamSheetCaption } from "./results";
import { kickaboutMessage, teamSheetMessage } from "./team-sheet";

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
  it("names both sides by the shirt, with a matching dot", () => {
    const teams = pickTeams(commit(Array.from({ length: 10 }, (_, i) => player(`p${i}`))), SHAPE);
    const text = teamSheetMessage({ teams, kickoffAt: KICKOFF, venue: "Muizenberg" });

    expect(text).toContain("Black");
    expect(text).toContain("White");

    // The dot has to agree with the name. A colour token with no dot falls through to
    // nothing, and the team sheet would say "Black" beside a blank — which is the one
    // detail somebody standing at the pitch is actually looking for.
    expect(text).toContain("⚫");
    expect(text).toContain("⚪");
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

describe("kickaboutMessage", () => {
  const SHAPE = { playersPerTeam: 8, subsPerTeam: 3 };

  it("never calls the game off, even with one person", () => {
    const format = formatFor(1, SHAPE);
    const text = kickaboutMessage({ confirmed: 1, format, kickoffAt: KICKOFF });

    expect(text).not.toContain("Called off");
    expect(text).not.toContain("called off");
    expect(text).not.toContain("cancelled");
  });

  it("tells the one person who turned up what to do instead", () => {
    const format = formatFor(1, SHAPE);
    const text = kickaboutMessage({ confirmed: 1, format, kickoffAt: KICKOFF });

    expect(text).toContain("1 person");
    expect(text).toContain(format.label);
    expect(text).toContain("shooting practice");
    // The door stays open — this is a state the evening can still climb out of.
    expect(text).toContain("poll stays open");
  });

  it("uses the plural when there are two of them and no sides to pick", () => {
    const text = kickaboutMessage({ confirmed: 0, format: formatFor(0, SHAPE), kickoffAt: KICKOFF });
    expect(text).toContain("0 people");
  });
});

describe("teamSheetCaption", () => {
  const SHAPE = { playersPerTeam: 8, subsPerTeam: 3 };

  it("carries the format, because the caption is what the group actually reads", () => {
    // The team sheet is sent as a photo. teamSheetMessage is only the FALLBACK, used
    // when the render fails and at no other time — so a small turnout announced only
    // there is announced to nobody. This shipped that way for about ten minutes and
    // was caught by driving a five-person Wednesday and reading the outbox.
    const caption = teamSheetCaption({
      kickoffAt: KICKOFF,
      venue: "Muizenberg",
      format: formatFor(5, SHAPE),
    });

    expect(caption).toContain("3 v 2");
    expect(caption).toContain("rotates");
  });

  it("stays a single line on a normal week", () => {
    const caption = teamSheetCaption({
      kickoffAt: KICKOFF,
      venue: "Muizenberg",
      format: formatFor(14, SHAPE),
    });

    expect(caption).not.toContain("tonight —");
    expect(caption.split("\n")).toHaveLength(1);
  });
});

describe("teamSheetMessage with a small turnout", () => {
  const SHAPE = { playersPerTeam: 8, subsPerTeam: 3 };

  it("names the format at the top, before the names", () => {
    const teams = pickTeams(commit(Array.from({ length: 6 }, (_, i) => player(`p${i}`))), SHAPE);
    const text = teamSheetMessage({
      teams,
      kickoffAt: KICKOFF,
      venue: "Muizenberg",
      format: formatFor(6, SHAPE),
    });

    expect(text).toContain("3 v 3");
    expect(text).toContain("Keeper rotates every goal");

    // Above the names: on a thin week "is it even on?" is the first question, and the
    // answer cannot be at the bottom of a list of six people.
    expect(text.indexOf("3 v 3")).toBeLessThan(text.indexOf("Black"));
  });

  it("says nothing extra on a normal week", () => {
    const teams = pickTeams(commit(Array.from({ length: 10 }, (_, i) => player(`p${i}`))), SHAPE);
    const text = teamSheetMessage({
      teams,
      kickoffAt: KICKOFF,
      venue: "Muizenberg",
      format: formatFor(10, SHAPE),
    });

    expect(text).not.toContain("tonight —");
  });
});

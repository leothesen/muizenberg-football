import { describe, expect, it } from "vitest";
import {
  capacityOf,
  minimumViable,
  promotionsAfterDropout,
  splitSquad,
  squadHealth,
} from "./squad";
import type { Commitment, PlayerLike, SquadShape } from "./types";

const SHAPE: SquadShape = { playersPerTeam: 8, subsPerTeam: 3 };

function player(id: string, rating = 65): PlayerLike {
  return {
    id,
    displayName: id,
    emoji: "⚽",
    rating,
    preferredPosition: "anywhere",
  };
}

/** Commitments one minute apart, in the order given. */
function commitments(...ids: string[]): Commitment[] {
  const base = new Date("2026-09-08T12:00:00Z").getTime();
  return ids.map((id, i) => ({
    player: player(id),
    inSince: new Date(base + i * 60_000),
  }));
}

describe("capacity", () => {
  it("counts both teams including subs", () => {
    expect(capacityOf(SHAPE)).toBe(22);
    expect(capacityOf({ playersPerTeam: 5, subsPerTeam: 0 })).toBe(10);
  });

  it("needs enough bodies to be worth turning up for", () => {
    expect(minimumViable(SHAPE)).toBe(8);
    // Never drops below six however small the format.
    expect(minimumViable({ playersPerTeam: 4, subsPerTeam: 0 })).toBe(6);
  });
});

describe("splitSquad", () => {
  it("orders by who committed first", () => {
    const squad = splitSquad(commitments("c", "a", "b"), SHAPE);
    expect(squad.playing.map((c) => c.player.id)).toEqual(["c", "a", "b"]);
  });

  it("is insensitive to the order the rows arrive in", () => {
    const list = commitments("first", "second", "third");
    const shuffled = [list[2]!, list[0]!, list[1]!];
    expect(splitSquad(shuffled, SHAPE).playing.map((c) => c.player.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("pushes everyone past capacity onto the waitlist", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const squad = splitSquad(commitments(...ids), SHAPE);
    expect(squad.playing).toHaveLength(22);
    expect(squad.waitlisted.map((c) => c.player.id)).toEqual(["p22", "p23", "p24"]);
  });

  it("breaks identical timestamps deterministically rather than by input order", () => {
    const sameMoment = new Date("2026-09-08T12:00:00Z");
    const tied: Commitment[] = [
      { player: player("zoe"), inSince: sameMoment },
      { player: player("adam"), inSince: sameMoment },
    ];
    const forwards = splitSquad(tied, SHAPE).playing.map((c) => c.player.id);
    const backwards = splitSquad([...tied].reverse(), SHAPE).playing.map(
      (c) => c.player.id,
    );
    expect(forwards).toEqual(["adam", "zoe"]);
    expect(backwards).toEqual(forwards);
  });

  it("does not mutate the caller's array", () => {
    const list = commitments("c", "a", "b");
    const snapshot = list.map((c) => c.player.id);
    splitSquad(list, SHAPE);
    expect(list.map((c) => c.player.id)).toEqual(snapshot);
  });
});

describe("squadHealth", () => {
  it("reports a game that is short of players", () => {
    const health = squadHealth(commitments("a", "b", "c"), SHAPE);
    expect(health).toMatchObject({
      confirmed: 3,
      capacity: 22,
      spotsLeft: 19,
      viable: false,
      shortBy: 5,
      full: false,
    });
  });

  it("flips to viable at the minimum", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    expect(squadHealth(commitments(...ids), SHAPE)).toMatchObject({
      viable: true,
      shortBy: 0,
    });
  });

  it("reports a full game with a waitlist", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    expect(squadHealth(commitments(...ids), SHAPE)).toMatchObject({
      confirmed: 22,
      spotsLeft: 0,
      waitlistLength: 2,
      full: true,
    });
  });
});

describe("promotionsAfterDropout", () => {
  it("names only the player who actually moved onto the pitch", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const before = commitments(...ids);
    // p05 drops out; p22 is first off the waitlist.
    const after = before.filter((c) => c.player.id !== "p05");

    const promoted = promotionsAfterDropout(before, after, SHAPE);
    expect(promoted.map((c) => c.player.id)).toEqual(["p22"]);
  });

  it("promotes nobody when the game was not full", () => {
    const before = commitments("a", "b", "c");
    const after = before.filter((c) => c.player.id !== "b");
    expect(promotionsAfterDropout(before, after, SHAPE)).toEqual([]);
  });

  it("promotes two when two drop out at once", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const before = commitments(...ids);
    const after = before.filter((c) => !["p01", "p02"].includes(c.player.id));
    expect(promotionsAfterDropout(before, after, SHAPE).map((c) => c.player.id)).toEqual(
      ["p22", "p23"],
    );
  });
});

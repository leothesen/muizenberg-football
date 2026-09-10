import { beforeAll, describe, expect, it } from "vitest";
import { resetToSeed } from "@/test/db/reset";
import { sortRows, stable } from "@/test/db/normalise";
import {
  type Anchors,
  insertFantasyData,
  loadAnchors,
  rawQuery,
} from "@/test/db/anchors";
import * as stats from "./stats";

/**
 * The server-side read models.
 *
 * These feed the Telegram summaries, the player cards and the leaderboards, and
 * every one becomes hand-written SQL in N8. The snapshots below are what the port
 * has to reproduce.
 *
 * Several of these return a Map keyed by player id, and ids are regenerated on every
 * reset — so the maps are resolved to display names before being compared. That is
 * also more useful to read: a snapshot saying "Leo: 3" survives review in a way that
 * a uuid does not.
 */

let anchors: Anchors;
let nameById: Map<string, string>;
let weekOfFixture: Map<string, number>;

beforeAll(async () => {
  await resetToSeed();
  anchors = await loadAnchors();
  await insertFantasyData(anchors.playerId);

  const players = await rawQuery<{ id: string; display_name: string }>(
    "select id, display_name from players",
  );
  nameById = new Map(players.map((p) => [p.id, p.display_name]));

  const fixtures = await rawQuery<{ id: string }>(
    "select id from fixtures where status = 'played' order by kickoff_at",
  );
  weekOfFixture = new Map(fixtures.map((f, index) => [f.id, index + 1]));
});

/** A Map keyed by player id, rendered as something a human can review. */
function byPlayerName<V, T>(
  map: ReadonlyMap<string, V>,
  project: (value: V) => T,
): { player: string; value: T }[] {
  return [...map.entries()]
    .map(([playerId, value]) => ({
      player: nameById.get(playerId) ?? `unknown:${playerId}`,
      value: project(value),
    }))
    .sort((a, b) => a.player.localeCompare(b.player));
}

/** Fixture ids mean nothing across resets; which week they were does. */
function weeks(fixtureIds: Iterable<string>): number[] {
  return [...fixtureIds]
    .map((id) => weekOfFixture.get(id) ?? 0)
    .sort((a, b) => a - b);
}

describe("stats", () => {
  it("seasonTable", async () => {
    const rows = await stats.seasonTable(anchors.seasonId);
    expect(rows.length).toBeGreaterThan(0);
    expect(stable(sortRows(rows, "displayName"))).toMatchSnapshot();
  });

  it("careerTable", async () => {
    const rows = await stats.careerTable();
    expect(rows.length).toBeGreaterThan(0);
    expect(stable(sortRows(rows, "displayName"))).toMatchSnapshot();
  });

  it("careerTotals", async () => {
    const totals = await stats.careerTotals();
    expect(totals.size).toBeGreaterThan(0);
    expect(stable(byPlayerName(totals, (v) => v))).toMatchSnapshot();
  });

  it("fixtureStatRows", async () => {
    const rows = await stats.fixtureStatRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(
      stable(sortRows(rows, "kickoffAt", "displayName")),
    ).toMatchSnapshot();
  });

  it("playerNames", async () => {
    const names = await stats.playerNames();
    expect(names.size).toBe(16);
    expect(stable(byPlayerName(names, (v) => v))).toMatchSnapshot();
  });

  it("playedFixtureIds", async () => {
    const ids = await stats.playedFixtureIds();

    // The ids themselves are meaningless across resets; the count and the ordering
    // are the contract. Mapped through the week lookup, which is built from the same
    // ordering, so a reversed result would show up as 4,3,2,1.
    expect(ids.map((id) => weekOfFixture.get(id))).toMatchSnapshot();
  });

  it("appearancesByPlayer", async () => {
    const appearances = await stats.appearancesByPlayer();
    expect(appearances.size).toBeGreaterThan(0);
    expect(byPlayerName(appearances, (set) => weeks(set))).toMatchSnapshot();
  });

  it("currentStreaks", async () => {
    const streaks = await stats.currentStreaks();
    expect(streaks.size).toBeGreaterThan(0);
    expect(byPlayerName(streaks, (v) => v)).toMatchSnapshot();
  });

  it("badgesHeldBy", async () => {
    const held = await stats.badgesHeldBy([
      anchors.playerId,
      anchors.otherPlayerId,
    ]);

    // Only the first player was given badges, so this also pins that the query does
    // not leak somebody else's.
    expect(held.size).toBeGreaterThan(0);
    expect(byPlayerName(held, (set) => [...set].sort())).toMatchSnapshot();
  });

  it("badgesHeldBy is empty for players who hold none", async () => {
    const held = await stats.badgesHeldBy([anchors.otherPlayerId]);
    const codes = held.get(anchors.otherPlayerId);
    expect(codes === undefined || codes.size === 0).toBe(true);
  });

  it("badgeCatalogue", async () => {
    const catalogue = await stats.badgeCatalogue();
    expect(stable(catalogue)).toMatchSnapshot();
  });

  it("badgesFor", async () => {
    const awards = await stats.badgesFor(anchors.playerId);
    expect(awards.length).toBeGreaterThan(0);
    expect(stable(awards)).toMatchSnapshot();
  });

  it("recentForm", async () => {
    const form = await stats.recentForm(anchors.playerId);
    expect(form.length).toBeGreaterThan(0);
    expect(stable(form)).toMatchSnapshot();
  });

  it("recentForm respects its limit and takes the most recent", async () => {
    const all = await stats.recentForm(anchors.playerId, 50);
    const limited = await stats.recentForm(anchors.playerId, 2);

    expect(all.length).toBeGreaterThan(2);
    expect(limited).toHaveLength(2);
    expect(stable(limited)).toEqual(stable(all.slice(0, 2)));
  });

  it("streakInputs", async () => {
    const result = await stats.streakInputs();
    expect(result.byPlayer.size).toBeGreaterThan(0);

    expect({
      weeks: result.fixtureIdsOldestFirst.length,
      byPlayer: [...result.byPlayer.values()]
        .map((entry) => ({
          displayName: entry.holder.displayName,
          appearedInWeeks: weeks(entry.fixtureIds),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }).toMatchSnapshot();
  });
});

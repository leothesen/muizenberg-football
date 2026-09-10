import { beforeEach, describe, expect, it } from "vitest";
import { pickTeams } from "@/domain/teams";
import { resetToSeed } from "@/test/db/reset";
import { sortRows, stable } from "@/test/db/normalise";
import { type Anchors, loadAnchors, rawQuery } from "@/test/db/anchors";
import { commitmentsFor, shapeOf } from "./rsvps";
import { fixtureById } from "./fixtures";
import * as teams from "./teams";

/**
 * Team sheets.
 *
 * `saveTeams` replaces any previous sheet rather than adding to it — re-picking is a
 * legitimate thing to do when somebody drops out an hour before kickoff, and a port
 * that appended instead would quietly put people on both sides.
 *
 * The teams under test are produced by the real balancer rather than invented here,
 * so the rows being written are the shape production actually writes.
 */

let anchors: Anchors;

beforeEach(async () => {
  await resetToSeed();
  anchors = await loadAnchors();
});

async function pickForUpcoming() {
  const fixture = await fixtureById(anchors.upcomingFixtureId);
  const commitments = await commitmentsFor(anchors.upcomingFixtureId);
  return pickTeams(commitments, shapeOf(fixture!));
}

describe("saveTeams and teamsFor", () => {
  it("writes a sheet that reads back", async () => {
    const picked = await pickForUpcoming();
    await teams.saveTeams(anchors.upcomingFixtureId, picked);

    const stored = await teams.teamsFor(anchors.upcomingFixtureId);
    expect(stored).toHaveLength(2);

    expect(
      stable(
        sortRows(stored, "team").map((entry) => ({
          colour: entry.team.colour,
          name: entry.team.name,
          side: entry.team.side,
          players: sortRows(entry.players, "displayName"),
        })),
      ),
    ).toMatchSnapshot();
  });

  it("balances by average rating, so an odd turnout is still a fair game", async () => {
    const picked = await pickForUpcoming();

    const avg = (players: { rating: number }[]) =>
      players.reduce((sum, p) => sum + p.rating, 0) / players.length;

    const aSide = [...picked.a.starters, ...picked.a.subs];
    const bSide = [...picked.b.starters, ...picked.b.subs];

    // The bug this replaced: minimising the difference in TOTAL rating reported a gap
    // of 31.5 for two well-matched sides, purely because one had an extra body.
    expect(Math.abs(avg(aSide) - avg(bSide))).toBeLessThan(1);
    expect(picked.ratingGap).toBeLessThan(1);
  });

  it("re-picking replaces the sheet rather than adding to it", async () => {
    const picked = await pickForUpcoming();
    await teams.saveTeams(anchors.upcomingFixtureId, picked);
    await teams.saveTeams(anchors.upcomingFixtureId, picked);

    const [teamCount] = await rawQuery<{ n: string }>(
      "select count(*) as n from fixture_teams where fixture_id = $1",
      [anchors.upcomingFixtureId],
    );
    const [memberCount] = await rawQuery<{ n: string }>(
      `select count(*) as n from team_players tp
         join fixture_teams ft on ft.id = tp.fixture_team_id
        where ft.fixture_id = $1`,
      [anchors.upcomingFixtureId],
    );

    expect(teamCount!.n).toBe("2");
    // Nobody appears twice, which is what "replaces" has to mean.
    const expected =
      picked.a.starters.length +
      picked.a.subs.length +
      picked.b.starters.length +
      picked.b.subs.length;
    expect(Number(memberCount!.n)).toBe(expected);
  });

  it("teamsFor is empty before anyone has picked", async () => {
    expect(await teams.teamsFor(anchors.upcomingFixtureId)).toEqual([]);
  });
});

describe("attachTeamsMessage", () => {
  it("remembers which message carried the team sheet", async () => {
    await teams.saveTeams(anchors.upcomingFixtureId, await pickForUpcoming());
    await teams.attachTeamsMessage(anchors.upcomingFixtureId, 987654);

    const [row] = await rawQuery<{ teams_message_id: string }>(
      "select teams_message_id from fixtures where id = $1",
      [anchors.upcomingFixtureId],
    );

    expect(row!.teams_message_id).toBe("987654");
  });
});

describe("selectedPlayers", () => {
  it("lists everybody on a sheet, starters and subs alike", async () => {
    const picked = await pickForUpcoming();
    await teams.saveTeams(anchors.upcomingFixtureId, picked);

    const selected = await teams.selectedPlayers(anchors.upcomingFixtureId);
    const expected =
      picked.a.starters.length +
      picked.a.subs.length +
      picked.b.starters.length +
      picked.b.subs.length;

    // Everyone who played gets asked how it went, subs included.
    expect(selected).toHaveLength(expected);

    // selectedPlayers has no ORDER BY either, and the name is nested under `players`
    // rather than on the row — so sorting by a top-level "display_name" was a silent
    // no-op that left the unstable database order in place.
    const ordered = [...selected].sort((a, b) =>
      (a.players?.display_name ?? "").localeCompare(
        b.players?.display_name ?? "",
      ),
    );
    expect(stable(ordered)).toMatchSnapshot();
  });

  it("is empty when no teams have been picked", async () => {
    expect(await teams.selectedPlayers(anchors.upcomingFixtureId)).toEqual([]);
  });
});

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { referenceDatabaseUrl } from "@/test/db/env";
import { resetToSeed } from "@/test/db/reset";
import { sortRows, stable } from "@/test/db/normalise";
import { rawQuery } from "@/test/db/anchors";
import * as queries from "./queries";

/**
 * What the public website sees.
 *
 * Every one of these reads through the anon key today and will read through
 * `web_reader` once N9 lands. The snapshots are the contract: the Drizzle port has to
 * reproduce them byte for byte, including row order, or it has changed behaviour.
 *
 * Ids are discovered rather than hardcoded, because the seed's primary keys come from
 * `gen_random_uuid()` and are new on every reset. They are looked up in a
 * deterministic order — by Telegram id, by kickoff — so the same player is "the first
 * player" every run.
 */

interface Anchors {
  seasonId: string;
  playerId: string;
  playedFixtureId: string;
  upcomingFixtureId: string;
}

let anchors: Anchors;

async function loadAnchors(): Promise<Anchors> {
  const client = new Client({ connectionString: referenceDatabaseUrl() });
  await client.connect();

  try {
    const one = async (sql: string): Promise<string> => {
      const { rows } = await client.query<{ id: string }>(sql);
      const first = rows[0];
      if (!first) throw new Error(`no row for anchor query: ${sql}`);
      return first.id;
    };

    return {
      seasonId: await one("select id from seasons order by started_on limit 1"),
      playerId: await one(
        "select id from players order by telegram_user_id limit 1",
      ),
      playedFixtureId: await one(
        "select id from fixtures where status = 'played' order by kickoff_at limit 1",
      ),
      upcomingFixtureId: await one(
        "select id from fixtures where status <> 'played' order by kickoff_at limit 1",
      ),
    };
  } finally {
    await client.end();
  }
}

/**
 * Give the fantasy layer something to read.
 *
 * A freshly seeded league has never been settled, so `rating_events` and
 * `player_badges` are both empty and the two queries that read them snapshot as `[]`
 * — a test that passes whatever the ported code does. These rows are inserted
 * directly rather than by running settlement, because settlement is itself being
 * ported (N8) and a characterisation test should not depend on the thing it is
 * meant to be independent of.
 *
 * `created_at` and `earned_at` are set explicitly. Left to default they would all be
 * the same `now()` within one transaction, and any query ordering by them would come
 * back in an arbitrary order that changes between runs.
 */
async function insertFantasyData(playerId: string): Promise<void> {
  const client = new Client({ connectionString: referenceDatabaseUrl() });
  await client.connect();

  try {
    await client.query(
      `insert into rating_events
         (player_id, fixture_id, rating_before, rating_after, delta, reason, created_at)
       select $1, f.id,
              65.00 + (row_number() over w - 1),
              66.00 + (row_number() over w - 1),
              1.00,
              'played',
              timestamptz '2026-08-01 18:00:00+02' + ((row_number() over w) * interval '7 days')
         from fixtures f
        where f.status = 'played'
       window w as (order by f.kickoff_at)`,
      [playerId],
    );

    await client.query(
      `insert into player_badges (player_id, badge_code, fixture_id, earned_at)
       select $1, b.code,
              (select id from fixtures where status = 'played' order by kickoff_at limit 1),
              timestamptz '2026-08-01 20:00:00+02' + ((row_number() over w) * interval '1 day')
         from badges b
       window w as (order by b.sort_order, b.code)
        order by b.sort_order, b.code
        limit 3`,
      [playerId],
    );
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await resetToSeed();
  anchors = await loadAnchors();
  await insertFantasyData(anchors.playerId);
});

describe("the web_reader boundary", () => {
  /**
   * Added at N9. Every other test here would pass just as happily if these queries
   * ran as the owning role — the views return the same rows either way, and a port
   * that quietly used the writer handle would look perfectly healthy.
   *
   * This settles it from the database's side: take `web_reader`'s access to one view
   * away and the public query must fail. It can only fail if the call really is
   * running as that role.
   */
  afterEach(async () => {
    await rawQuery("grant select on public.v_players_public to web_reader");
  });

  it("really runs as web_reader, not as the owner", async () => {
    expect((await queries.allPlayers()).length).toBeGreaterThan(0);

    await rawQuery("revoke select on public.v_players_public from web_reader");

    await expect(queries.allPlayers()).rejects.toThrow();
  });

  it("recovers as soon as the grant is back", async () => {
    await rawQuery("revoke select on public.v_players_public from web_reader");
    await expect(queries.allPlayers()).rejects.toThrow();

    await rawQuery("grant select on public.v_players_public to web_reader");
    expect((await queries.allPlayers()).length).toBeGreaterThan(0);
  });
});

describe("public queries", () => {
  it("currentSeason", async () => {
    expect(stable(await queries.currentSeason())).toMatchSnapshot();
  });

  // `seasonTable`, `careerTable`, `fixtureStatRows`, `teamsForFixture` and
  // `motmForFixture` have no ORDER BY — not in the query, not in the view — so
  // Postgres returns them in whatever order the plan produces, and it really does
  // vary between runs. Sorted here on business keys so there is something stable to
  // characterise. N9 gives these a total order in SQL, at which point the sort below
  // becomes belt and braces rather than the only thing holding them still.
  it("seasonTable", async () => {
    const rows = await queries.seasonTable(anchors.seasonId);
    expect(rows.length).toBeGreaterThan(0);
    expect(stable(sortRows(rows, "displayName"))).toMatchSnapshot();
  });

  it("allPlayers", async () => {
    expect(stable(await queries.allPlayers())).toMatchSnapshot();
  });

  it("playerById", async () => {
    expect(
      stable(await queries.playerById(anchors.playerId)),
    ).toMatchSnapshot();
  });

  it("playerById returns null for an unknown id", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await queries.playerById(missing)).toBeNull();
  });

  it("careerTable", async () => {
    const rows = await queries.careerTable();
    expect(rows.length).toBeGreaterThan(0);
    expect(stable(sortRows(rows, "displayName"))).toMatchSnapshot();
  });

  it("fixtureStatRows", async () => {
    const rows = await queries.fixtureStatRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(
      stable(sortRows(rows, "kickoffAt", "displayName")),
    ).toMatchSnapshot();
  });

  it("allFixtures", async () => {
    expect(stable(await queries.allFixtures())).toMatchSnapshot();
  });

  it("fixtureById", async () => {
    expect(
      stable(await queries.fixtureById(anchors.playedFixtureId)),
    ).toMatchSnapshot();
  });

  it("nextFixture", async () => {
    // Fixed instant: `nextFixture` is relative to now, and a clock-dependent
    // snapshot would rot the moment the seeded season is in the past.
    const seasonStart = new Date("2026-08-01T00:00:00Z");
    expect(stable(await queries.nextFixture(seasonStart))).toMatchSnapshot();
  });

  it("teamsForFixture", async () => {
    const teams = await queries.teamsForFixture(anchors.playedFixtureId);
    expect(teams.length).toBeGreaterThan(0);

    expect(
      stable(
        sortRows(teams, "colour").map((team) => ({
          ...team,
          players: sortRows(team.players, "displayName"),
        })),
      ),
    ).toMatchSnapshot();
  });

  it("teamsForFixture is empty before teams are picked", async () => {
    expect(await queries.teamsForFixture(anchors.upcomingFixtureId)).toEqual(
      [],
    );
  });

  it("badgesForPlayer", async () => {
    const held = await queries.badgesForPlayer(anchors.playerId);

    // Guard the guard: if this ever came back empty the snapshot below would pass
    // for ever while proving nothing about the ported query.
    expect(held.length).toBeGreaterThan(0);
    expect(stable(held)).toMatchSnapshot();
  });

  it("badgesForPlayer is empty for a player who has earned none", async () => {
    const others = await queries.allPlayers();
    const someoneElse = others.find((p) => p.id !== anchors.playerId);
    expect(someoneElse).toBeDefined();
    expect(await queries.badgesForPlayer(someoneElse!.id)).toEqual([]);
  });

  it("ratingHistory", async () => {
    const history = await queries.ratingHistory(anchors.playerId);

    expect(history.length).toBeGreaterThan(0);
    expect(stable(history)).toMatchSnapshot();
  });

  it("ratingHistory respects its limit", async () => {
    const all = await queries.ratingHistory(anchors.playerId);
    const limited = await queries.ratingHistory(anchors.playerId, 2);

    // Only meaningful because there is more history than the limit asks for.
    expect(all.length).toBeGreaterThan(2);
    expect(limited).toHaveLength(2);
    // And the limit must take the newest, not an arbitrary two.
    expect(stable(limited)).toEqual(stable(all.slice(0, 2)));
  });

  it("motmForFixture", async () => {
    const rows = await queries.motmForFixture(anchors.playedFixtureId);
    expect(rows.length).toBeGreaterThan(0);
    expect(stable(sortRows(rows, "displayName"))).toMatchSnapshot();
  });

  it("streakInputs", async () => {
    const result = await queries.streakInputs();
    expect(result.byPlayer.size).toBeGreaterThan(0);

    // A Map of Sets does not snapshot usefully, and neither sorting nor tokenising
    // raw ids helps here: ids are regenerated on every reset, so ordering by them
    // shuffles the whole structure between runs.
    //
    // Each player's fixtures become *week numbers* — their index into
    // `fixtureIdsOldestFirst`, which is itself ordered oldest-first and therefore
    // stable. That is also the thing worth asserting: "appeared in weeks 1, 3 and 4"
    // is the input a streak is computed from, and an opaque set of uuids is not.
    const weekOf = new Map(
      result.fixtureIdsOldestFirst.map((id, index) => [id, index + 1]),
    );

    expect({
      weeks: result.fixtureIdsOldestFirst.length,
      byPlayer: [...result.byPlayer.values()]
        .map((entry) => ({
          displayName: entry.holder.displayName,
          emoji: entry.holder.emoji,
          appearedInWeeks: [...entry.fixtureIds]
            .map((id) => weekOf.get(id) ?? 0)
            .sort((a, b) => a - b),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }).toMatchSnapshot();
  });
});

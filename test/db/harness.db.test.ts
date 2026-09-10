import { beforeAll, describe, expect, it } from "vitest";
import { Client, type QueryResultRow } from "pg";
import { referenceDatabaseUrl } from "./env";
import { resetToSeed } from "./reset";
import { normaliser, stable } from "./normalise";

/**
 * The harness testing itself.
 *
 * Everything in this milestone is snapshots taken against a seeded database, so a
 * reset that is not reproducible, or a normaliser that flattens away the differences
 * it is meant to preserve, would produce a suite that passes no matter what the code
 * under test does. That failure mode is worse than having no tests, because it looks
 * like coverage. These run first.
 */

async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
): Promise<T[]> {
  const client = new Client({ connectionString: referenceDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<T>(sql);
    return rows;
  } finally {
    await client.end();
  }
}

describe("resetToSeed", () => {
  beforeAll(async () => {
    await resetToSeed();
  });

  it("lands on the league the seed describes", async () => {
    const [counts] = await query<Record<string, string>>(`
      select (select count(*) from players)        as players,
             (select count(*) from seasons)        as seasons,
             (select count(*) from fixtures)       as fixtures,
             (select count(*) from rsvps)          as rsvps,
             (select count(*) from match_reports)  as reports,
             (select count(*) from team_players)   as team_players,
             (select count(*) from badges)         as badges,
             (select count(*) from rating_events)  as rating_events,
             (select count(*) from player_badges)  as player_badges
    `);

    expect(counts).toEqual({
      players: "16",
      seasons: "1",
      fixtures: "5",
      rsvps: "80",
      reports: "64",
      team_players: "64",
      // Catalogue, owned by migration 0005 rather than the seed. If a reset ever
      // truncated it this would read "0" and every badge lookup below would return
      // nothing while looking perfectly healthy.
      badges: "25",
      // Settlement has not run on a freshly seeded league.
      rating_events: "0",
      player_badges: "0",
    });
  });

  it("is reproducible: two resets produce identical normalised data", async () => {
    const read = async () =>
      stable(
        await query(`
          select p.telegram_user_id, p.display_name, p.emoji, p.rating,
                 f.kickoff_at, f.status as fixture_status, r.status as rsvp_status,
                 r.in_since, mr.goals, mr.assists, mr.nutmegs
            from players p
            join rsvps r on r.player_id = p.id
            join fixtures f on f.id = r.fixture_id
            left join match_reports mr
              on mr.player_id = p.id and mr.fixture_id = f.id
           order by p.telegram_user_id, f.kickoff_at
        `),
      );

    const first = await read();
    await resetToSeed();
    const second = await read();

    expect(second).toEqual(first);
  });

  it("hands out fresh uuids each reset, which is why they are normalised", async () => {
    const rawIds = async () =>
      (
        await query<{ id: string }>(
          "select id from players order by telegram_user_id",
        )
      ).map((row) => row.id);

    const before = await rawIds();
    await resetToSeed();
    const after = await rawIds();

    // Same players, different primary keys. A snapshot of the raw rows would fail
    // every single run.
    expect(after).not.toEqual(before);
    expect(after).toHaveLength(before.length);
  });
});

describe("normaliser", () => {
  it("keeps identity: the same uuid becomes the same token", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    const other = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

    expect(
      stable([{ playerId: id }, { playerId: id }, { playerId: other }]),
    ).toEqual([
      { playerId: "<uuid-1>" },
      { playerId: "<uuid-1>" },
      { playerId: "<uuid-2>" },
    ]);
  });

  it("distinguishes rows that point at different players", () => {
    const a = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    const b = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

    // The whole reason ids are tokenised rather than dropped: a join that pairs the
    // wrong rows has to be visible.
    expect(stable({ scorer: a, assist: b })).not.toEqual(
      stable({ scorer: a, assist: a }),
    );
  });

  it("numbers tokens per snapshot, so one test cannot renumber another", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    const first = normaliser();
    const second = normaliser();

    expect(first({ id })).toEqual({ id: "<uuid-1>" });
    expect(second({ id })).toEqual({ id: "<uuid-1>" });
  });

  it("flattens row timestamps but leaves meaningful dates alone", () => {
    expect(
      stable({
        created_at: "2026-09-10T12:00:00Z",
        updated_at: "2026-09-10T12:00:00Z",
        kickoff_at: "2026-09-09T16:00:00Z",
        started_on: "2026-09-01",
      }),
    ).toEqual({
      created_at: "<timestamp>",
      updated_at: "<timestamp>",
      // Seed-derived and reproducible, so it stays: a fixture scheduled on the wrong
      // day must fail the snapshot.
      kickoff_at: "2026-09-09T16:00:00Z",
      started_on: "2026-09-01",
    });
  });

  it("walks nested structures", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

    expect(
      stable({
        teams: [{ players: [{ id, created_at: "2026-01-01T00:00:00Z" }] }],
      }),
    ).toEqual({
      teams: [{ players: [{ id: "<uuid-1>", created_at: "<timestamp>" }] }],
    });
  });
});

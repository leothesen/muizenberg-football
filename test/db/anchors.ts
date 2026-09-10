import { Client } from "pg";
import { testDatabaseUrl } from "./env";

/**
 * Stable handles on seeded rows.
 *
 * Every primary key in the seed comes from `gen_random_uuid()`, so nothing can be
 * hardcoded. These are looked up in a deterministic order — lowest Telegram id,
 * earliest kickoff — which makes "the first player" the same person on every run
 * without pinning a value that changes.
 */
export interface Anchors {
  seasonId: string;
  playerId: string;
  otherPlayerId: string;
  playedFixtureId: string;
  upcomingFixtureId: string;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function loadAnchors(): Promise<Anchors> {
  return withClient(async (client) => {
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
      otherPlayerId: await one(
        "select id from players order by telegram_user_id offset 1 limit 1",
      ),
      playedFixtureId: await one(
        "select id from fixtures where status = 'played' order by kickoff_at limit 1",
      ),
      upcomingFixtureId: await one(
        "select id from fixtures where status <> 'played' order by kickoff_at limit 1",
      ),
    };
  });
}

/**
 * Give the fantasy layer something to read.
 *
 * A freshly seeded league has never been settled, so `rating_events` and
 * `player_badges` are both empty and anything reading them snapshots as an empty
 * array — a test that passes whatever the ported code does. Inserted directly rather
 * than by running settlement, because settlement is itself being ported (N8) and a
 * characterisation test should not depend on the thing it exists to be independent
 * of.
 *
 * Timestamps are explicit. Left to default they would all be the same `now()` inside
 * one transaction, and any query ordering by them would come back in an arbitrary
 * order that changes between runs.
 */
export async function insertFantasyData(playerId: string): Promise<void> {
  await withClient(async (client) => {
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
  });
}

/** Run one query against the reference database, outside the code under test. */
export async function rawQuery<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withClient(async (client) => {
    const { rows } = await client.query(sql, params);
    return rows as T[];
  });
}

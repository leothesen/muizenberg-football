/**
 * The database, as TypeScript.
 *
 * Introspected from the live schema with `pnpm drizzle:pull` rather than retyped, so
 * the columns, checks, partial indexes and expression indexes are the real ones. It
 * replaces the 1,640 lines of `lib/database.types.ts` that Supabase generated.
 *
 * **Property names are snake_case, matching the columns exactly.** drizzle-kit emits
 * camelCase, which would make every query return `telegramUserId` where the rest of
 * this codebase has always had `telegram_user_id`. Renaming 143 properties once here
 * left 1,862 lines of consumers untouched and kept every characterisation snapshot
 * valid — the port is meant to change how a query is issued, not what it returns.
 *
 * THREE HAND-EDITS survive here, and `drizzle:pull` will silently undo every one of
 * them if anyone regenerates this file. Re-apply them:
 *
 *  0. The snake_case rename above, including the `table.someColumn` references in the
 *     constraint callbacks and in `relations.ts`.
 *
 *  1. `ratingEvents.reason` — drizzle-kit 0.31.10 emits `default(')` for an
 *     empty-string default, which does not parse. It must read `.default("")`.
 *  2. `badges` and `seasons` take `() => [...]` rather than `(table) => [...]`;
 *     their constraints are raw SQL and never touch the table object, so the
 *     generated parameter fails lint.
 *
 * Everything else in this file is generated output and should stay that way.
 */
import {
  pgTable,
  index,
  uniqueIndex,
  unique,
  check,
  uuid,
  bigint,
  text,
  boolean,
  timestamp,
  numeric,
  foreignKey,
  smallint,
  date,
  jsonb,
  pgView,
  integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const players = pgTable(
  "players",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    telegram_user_id: bigint("telegram_user_id", { mode: "number" }).notNull(),
    telegram_username: text("telegram_username"),
    first_name: text("first_name").notNull(),
    last_name: text("last_name"),
    display_name: text("display_name").notNull(),
    emoji: text().default("⚽").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    private_chat_id: bigint("private_chat_id", { mode: "number" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    rating: numeric({ precision: 5, scale: 2 }).default("65.00").notNull(),
  },
  (table) => [
    index("players_active_idx")
      .using("btree", table.is_active.asc().nullsLast().op("bool_ops"))
      .where(sql`is_active`),
    uniqueIndex("players_telegram_username_idx")
      .using("btree", sql`lower(telegram_username)`)
      .where(sql`(telegram_username IS NOT NULL)`),
    unique("players_telegram_user_id_key").on(table.telegram_user_id),
    check(
      "players_rating_check",
      sql`(rating >= (40)::numeric) AND (rating <= (99)::numeric)`,
    ),
  ],
);

export const matchReports = pgTable(
  "match_reports",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fixture_id: uuid("fixture_id").notNull(),
    player_id: uuid("player_id").notNull(),
    goals: smallint().default(0).notNull(),
    assists: smallint().default(0).notNull(),
    nutmegs: smallint().default(0).notNull(),
    tackles: smallint().default(0).notNull(),
    saves: smallint().default(0).notNull(),
    own_goals: smallint("own_goals").default(0).notNull(),
    self_rating: smallint("self_rating"),
    motm_player_id: uuid("motm_player_id"),
    reported_goals_for: smallint("reported_goals_for"),
    reported_goals_against: smallint("reported_goals_against"),
    flow_state: text("flow_state").default("not_started").notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    flow_message_id: bigint("flow_message_id", { mode: "number" }),
    submitted_at: timestamp("submitted_at", {
      withTimezone: true,
      mode: "string",
    }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("match_reports_fixture_idx").using(
      "btree",
      table.fixture_id.asc().nullsLast().op("uuid_ops"),
    ),
    index("match_reports_pending_idx")
      .using("btree", table.fixture_id.asc().nullsLast().op("uuid_ops"))
      .where(sql`(submitted_at IS NULL)`),
    index("match_reports_player_idx").using(
      "btree",
      table.player_id.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.fixture_id],
      foreignColumns: [fixtures.id],
      name: "match_reports_fixture_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.motm_player_id],
      foreignColumns: [players.id],
      name: "match_reports_motm_player_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.player_id],
      foreignColumns: [players.id],
      name: "match_reports_player_id_fkey",
    }).onDelete("cascade"),
    unique("match_reports_fixture_id_player_id_key").on(
      table.fixture_id,
      table.player_id,
    ),
    check(
      "match_reports_assists_check",
      sql`(assists >= 0) AND (assists <= 30)`,
    ),
    check("match_reports_goals_check", sql`(goals >= 0) AND (goals <= 30)`),
    check(
      "match_reports_no_self_motm",
      sql`motm_player_id IS DISTINCT FROM player_id`,
    ),
    check(
      "match_reports_nutmegs_check",
      sql`(nutmegs >= 0) AND (nutmegs <= 30)`,
    ),
    check(
      "match_reports_own_goals_check",
      sql`(own_goals >= 0) AND (own_goals <= 10)`,
    ),
    check(
      "match_reports_reported_goals_against_check",
      sql`(reported_goals_against >= 0) AND (reported_goals_against <= 50)`,
    ),
    check(
      "match_reports_reported_goals_for_check",
      sql`(reported_goals_for >= 0) AND (reported_goals_for <= 50)`,
    ),
    check("match_reports_saves_check", sql`(saves >= 0) AND (saves <= 50)`),
    check(
      "match_reports_self_rating_check",
      sql`(self_rating >= 1) AND (self_rating <= 10)`,
    ),
    check(
      "match_reports_tackles_check",
      sql`(tackles >= 0) AND (tackles <= 50)`,
    ),
  ],
);

export const badges = pgTable(
  "badges",
  {
    code: text().primaryKey().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    emoji: text().notNull(),
    tier: text().default("bronze").notNull(),
    sort_order: smallint("sort_order").default(100).notNull(),
  },
  () => [
    check(
      "badges_tier_check",
      sql`tier = ANY (ARRAY['bronze'::text, 'silver'::text, 'gold'::text, 'legendary'::text])`,
    ),
  ],
);

export const playerBadges = pgTable(
  "player_badges",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    player_id: uuid("player_id").notNull(),
    badge_code: text("badge_code").notNull(),
    fixture_id: uuid("fixture_id"),
    earned_at: timestamp("earned_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("player_badges_player_idx").using(
      "btree",
      table.player_id.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.badge_code],
      foreignColumns: [badges.code],
      name: "player_badges_badge_code_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.fixture_id],
      foreignColumns: [fixtures.id],
      name: "player_badges_fixture_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.player_id],
      foreignColumns: [players.id],
      name: "player_badges_player_id_fkey",
    }).onDelete("cascade"),
    unique("player_badges_player_id_badge_code_key").on(
      table.player_id,
      table.badge_code,
    ),
  ],
);

export const ratingEvents = pgTable(
  "rating_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    player_id: uuid("player_id").notNull(),
    fixture_id: uuid("fixture_id"),
    rating_before: numeric("rating_before", {
      precision: 5,
      scale: 2,
    }).notNull(),
    rating_after: numeric("rating_after", { precision: 5, scale: 2 }).notNull(),
    delta: numeric({ precision: 5, scale: 2 }).notNull(),
    // drizzle-kit 0.31.10 emits `default(')` for an empty-string default, which is not
    // valid TypeScript. The database says `''::text`; every other string default in
    // this schema has content and round-tripped correctly.
    reason: text().default("").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("rating_events_player_idx").using(
      "btree",
      table.player_id.asc().nullsLast().op("timestamptz_ops"),
      table.created_at.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.fixture_id],
      foreignColumns: [fixtures.id],
      name: "rating_events_fixture_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.player_id],
      foreignColumns: [players.id],
      name: "rating_events_player_id_fkey",
    }).onDelete("cascade"),
    unique("rating_events_player_id_fixture_id_key").on(
      table.player_id,
      table.fixture_id,
    ),
  ],
);

export const seasons = pgTable(
  "seasons",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    started_on: date("started_on").notNull(),
    ended_on: date("ended_on"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  () => [
    uniqueIndex("seasons_one_current_idx")
      .using("btree", sql`((ended_on IS NULL))`)
      .where(sql`(ended_on IS NULL)`),
  ],
);

export const fixtures = pgTable(
  "fixtures",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    season_id: uuid("season_id").notNull(),
    kickoff_at: timestamp("kickoff_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    venue: text().default("Zandvlei Sports Ground").notNull(),
    // Only set when the game is somewhere unusual. A null pair means "look the name
    // up", so the league's own pitch is pinned in one place rather than copied into
    // every row. numeric comes back as a string — see venueOfFixture.
    venue_lat: numeric("venue_lat", { precision: 9, scale: 6 }),
    venue_lon: numeric("venue_lon", { precision: 9, scale: 6 }),
    venue_url: text("venue_url"),
    status: text().default("scheduled").notNull(),
    players_per_team: smallint("players_per_team").default(9).notNull(),
    subs_per_team: smallint("subs_per_team").default(3).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    rsvp_chat_id: bigint("rsvp_chat_id", { mode: "number" }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    rsvp_message_id: bigint("rsvp_message_id", { mode: "number" }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    teams_message_id: bigint("teams_message_id", { mode: "number" }),
    rsvp_closes_at: timestamp("rsvp_closes_at", {
      withTimezone: true,
      mode: "string",
    }),
    cancelled_reason: text("cancelled_reason"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("fixtures_kickoff_idx").using(
      "btree",
      table.kickoff_at.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("fixtures_season_kickoff_idx").using(
      "btree",
      table.season_id.asc().nullsLast().op("timestamptz_ops"),
      table.kickoff_at.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("fixtures_status_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.season_id],
      foreignColumns: [seasons.id],
      name: "fixtures_season_id_fkey",
    }).onDelete("restrict"),
    check(
      "fixtures_players_per_team_check",
      sql`(players_per_team >= 3) AND (players_per_team <= 11)`,
    ),
    check(
      "fixtures_status_check",
      sql`status = ANY (ARRAY['scheduled'::text, 'open'::text, 'locked'::text, 'played'::text, 'cancelled'::text])`,
    ),
    check(
      "fixtures_subs_per_team_check",
      sql`(subs_per_team >= 0) AND (subs_per_team <= 5)`,
    ),
    check(
      "fixtures_venue_lat_check",
      sql`venue_lat is null or (venue_lat >= -90 and venue_lat <= 90)`,
    ),
    check(
      "fixtures_venue_lon_check",
      sql`venue_lon is null or (venue_lon >= -180 and venue_lon <= 180)`,
    ),
    check(
      "fixtures_venue_point_check",
      sql`(venue_lat is null) = (venue_lon is null)`,
    ),
  ],
);

export const rsvps = pgTable(
  "rsvps",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fixture_id: uuid("fixture_id").notNull(),
    player_id: uuid("player_id").notNull(),
    status: text().notNull(),
    in_since: timestamp("in_since", { withTimezone: true, mode: "string" }),
    promoted_at: timestamp("promoted_at", {
      withTimezone: true,
      mode: "string",
    }),
    responded_at: timestamp("responded_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("rsvps_fixture_status_idx").using(
      "btree",
      table.fixture_id.asc().nullsLast().op("uuid_ops"),
      table.status.asc().nullsLast().op("timestamptz_ops"),
      table.in_since.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("rsvps_player_idx").using(
      "btree",
      table.player_id.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.fixture_id],
      foreignColumns: [fixtures.id],
      name: "rsvps_fixture_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.player_id],
      foreignColumns: [players.id],
      name: "rsvps_player_id_fkey",
    }).onDelete("cascade"),
    unique("rsvps_fixture_id_player_id_key").on(
      table.fixture_id,
      table.player_id,
    ),
    check(
      "rsvps_in_has_timestamp",
      sql`(status <> 'in'::text) OR (in_since IS NOT NULL)`,
    ),
    check(
      "rsvps_status_check",
      sql`status = ANY (ARRAY['in'::text, 'out'::text, 'maybe'::text])`,
    ),
  ],
);

export const fixtureTeams = pgTable(
  "fixture_teams",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fixture_id: uuid("fixture_id").notNull(),
    side: text().notNull(),
    name: text().notNull(),
    colour: text().default("hut-blue").notNull(),
    goals: smallint(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fixture_id],
      foreignColumns: [fixtures.id],
      name: "fixture_teams_fixture_id_fkey",
    }).onDelete("cascade"),
    unique("fixture_teams_fixture_id_side_key").on(
      table.fixture_id,
      table.side,
    ),
    check("fixture_teams_goals_check", sql`goals >= 0`),
    check(
      "fixture_teams_side_check",
      sql`side = ANY (ARRAY['a'::text, 'b'::text])`,
    ),
  ],
);

export const teamPlayers = pgTable(
  "team_players",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fixture_team_id: uuid("fixture_team_id").notNull(),
    player_id: uuid("player_id").notNull(),
    is_sub: boolean("is_sub").default(false).notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    fixture_id: uuid("fixture_id"),
  },
  (table) => [
    uniqueIndex("team_players_one_team_per_fixture_idx").using(
      "btree",
      table.fixture_id.asc().nullsLast().op("uuid_ops"),
      table.player_id.asc().nullsLast().op("uuid_ops"),
    ),
    index("team_players_player_idx").using(
      "btree",
      table.player_id.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.fixture_id],
      foreignColumns: [fixtures.id],
      name: "team_players_fixture_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.fixture_team_id],
      foreignColumns: [fixtureTeams.id],
      name: "team_players_fixture_team_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.player_id],
      foreignColumns: [players.id],
      name: "team_players_player_id_fkey",
    }).onDelete("cascade"),
    unique("team_players_fixture_team_id_player_id_key").on(
      table.fixture_team_id,
      table.player_id,
    ),
  ],
);

export const telegramUpdates = pgTable(
  "telegram_updates",
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    update_id: bigint("update_id", { mode: "number" }).primaryKey().notNull(),
    kind: text(),
    received_at: timestamp("received_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("telegram_updates_received_idx").using(
      "btree",
      table.received_at.desc().nullsFirst().op("timestamptz_ops"),
    ),
  ],
);

export const nightVotes = pgTable(
  "night_votes",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    // The Monday of the week, in league time. Scopes a vote to a poll without a poll
    // entity existing — see domain/nights.ts weekStart.
    week_start: date("week_start").notNull(),
    player_id: uuid("player_id").notNull(),
    night: text().notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("night_votes_week_idx").using(
      "btree",
      table.week_start.asc().nullsLast(),
      table.night.asc().nullsLast(),
    ),
    unique("night_votes_week_start_player_id_night_key").on(
      table.week_start,
      table.player_id,
      table.night,
    ),
    foreignKey({
      columns: [table.player_id],
      foreignColumns: [players.id],
      name: "night_votes_player_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const nightPolls = pgTable("night_polls", {
  week_start: date("week_start").primaryKey().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  chat_id: bigint("chat_id", { mode: "number" }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  message_id: bigint("message_id", { mode: "number" }),
  resolved_at: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});

export const botState = pgTable("bot_state", {
  key: text().primaryKey().notNull(),
  value: jsonb().default({}).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});

export const telegramEmulatorMessages = pgTable(
  "telegram_emulator_messages",
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({
      name: "telegram_emulator_messages_id_seq",
      startWith: 1,
      increment: 1,
      minValue: 1,
      maxValue: 9223372036854775807,
      cache: 1,
    }),
    method: text().notNull(),
    params: jsonb().default({}).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    chat_id: bigint("chat_id", { mode: "number" }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    receiver_user_id: bigint("receiver_user_id", { mode: "number" }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    target_message_id: bigint("target_message_id", { mode: "number" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("telegram_emulator_messages_chat_idx").using(
      "btree",
      table.chat_id.asc().nullsLast().op("int8_ops"),
      table.id.desc().nullsFirst().op("int8_ops"),
    ),
  ],
);
export const vFixtureMotmVotes = pgView("v_fixture_motm_votes", {
  fixture_id: uuid("fixture_id"),
  player_id: uuid("player_id"),
  votes: integer(),
}).as(
  sql`SELECT fixture_id, motm_player_id AS player_id, count(*)::integer AS votes FROM match_reports mr WHERE motm_player_id IS NOT NULL AND submitted_at IS NOT NULL GROUP BY fixture_id, motm_player_id`,
);

export const vPlayerFixtureStats = pgView("v_player_fixture_stats", {
  player_id: uuid("player_id"),
  fixture_id: uuid("fixture_id"),
  season_id: uuid("season_id"),
  kickoff_at: timestamp("kickoff_at", { withTimezone: true, mode: "string" }),
  side: text(),
  goals_for: smallint("goals_for"),
  goals_against: smallint("goals_against"),
  outcome: text(),
  is_sub: boolean("is_sub"),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  own_goals: integer("own_goals"),
  self_rating: smallint("self_rating"),
  motm_votes: integer("motm_votes"),
  reported: boolean(),
}).as(
  sql`SELECT tp.player_id, f.id AS fixture_id, f.season_id, f.kickoff_at, ft.side, ft.goals AS goals_for, opp.goals AS goals_against, CASE WHEN ft.goals IS NULL OR opp.goals IS NULL THEN NULL::text WHEN ft.goals > opp.goals THEN 'win'::text WHEN ft.goals < opp.goals THEN 'loss'::text ELSE 'draw'::text END AS outcome, tp.is_sub, COALESCE(mr.goals::integer, 0) AS goals, COALESCE(mr.assists::integer, 0) AS assists, COALESCE(mr.nutmegs::integer, 0) AS nutmegs, COALESCE(mr.tackles::integer, 0) AS tackles, COALESCE(mr.saves::integer, 0) AS saves, COALESCE(mr.own_goals::integer, 0) AS own_goals, mr.self_rating, COALESCE(v.votes, 0) AS motm_votes, mr.submitted_at IS NOT NULL AS reported FROM team_players tp JOIN fixtures f ON f.id = tp.fixture_id JOIN fixture_teams ft ON ft.id = tp.fixture_team_id JOIN fixture_teams opp ON opp.fixture_id = f.id AND opp.side <> ft.side LEFT JOIN match_reports mr ON mr.fixture_id = f.id AND mr.player_id = tp.player_id AND mr.submitted_at IS NOT NULL LEFT JOIN v_fixture_motm_votes v ON v.fixture_id = f.id AND v.player_id = tp.player_id WHERE f.status = 'played'::text`,
);

export const vPlayerSeasonStats = pgView("v_player_season_stats", {
  player_id: uuid("player_id"),
  season_id: uuid("season_id"),
  appearances: integer(),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  own_goals: integer("own_goals"),
  motm_votes: integer("motm_votes"),
  wins: integer(),
  draws: integer(),
  losses: integer(),
  avg_self_rating: numeric("avg_self_rating"),
  last_played_at: timestamp("last_played_at", {
    withTimezone: true,
    mode: "string",
  }),
}).as(
  sql`SELECT player_id, season_id, count(*)::integer AS appearances, sum(goals)::integer AS goals, sum(assists)::integer AS assists, sum(nutmegs)::integer AS nutmegs, sum(tackles)::integer AS tackles, sum(saves)::integer AS saves, sum(own_goals)::integer AS own_goals, sum(motm_votes)::integer AS motm_votes, count(*) FILTER (WHERE outcome = 'win'::text)::integer AS wins, count(*) FILTER (WHERE outcome = 'draw'::text)::integer AS draws, count(*) FILTER (WHERE outcome = 'loss'::text)::integer AS losses, round(avg(self_rating), 2) AS avg_self_rating, max(kickoff_at) AS last_played_at FROM v_player_fixture_stats s GROUP BY player_id, season_id`,
);

export const vPlayerCareerStats = pgView("v_player_career_stats", {
  player_id: uuid("player_id"),
  appearances: integer(),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  own_goals: integer("own_goals"),
  motm_votes: integer("motm_votes"),
  wins: integer(),
  draws: integer(),
  losses: integer(),
  avg_self_rating: numeric("avg_self_rating"),
  first_played_at: timestamp("first_played_at", {
    withTimezone: true,
    mode: "string",
  }),
  last_played_at: timestamp("last_played_at", {
    withTimezone: true,
    mode: "string",
  }),
}).as(
  sql`SELECT player_id, count(*)::integer AS appearances, sum(goals)::integer AS goals, sum(assists)::integer AS assists, sum(nutmegs)::integer AS nutmegs, sum(tackles)::integer AS tackles, sum(saves)::integer AS saves, sum(own_goals)::integer AS own_goals, sum(motm_votes)::integer AS motm_votes, count(*) FILTER (WHERE outcome = 'win'::text)::integer AS wins, count(*) FILTER (WHERE outcome = 'draw'::text)::integer AS draws, count(*) FILTER (WHERE outcome = 'loss'::text)::integer AS losses, round(avg(self_rating), 2) AS avg_self_rating, min(kickoff_at) AS first_played_at, max(kickoff_at) AS last_played_at FROM v_player_fixture_stats s GROUP BY player_id`,
);

export const vFixturesPublic = pgView("v_fixtures_public", {
  id: uuid(),
  season_id: uuid("season_id"),
  kickoff_at: timestamp("kickoff_at", { withTimezone: true, mode: "string" }),
  venue: text(),
  status: text(),
  players_per_team: smallint("players_per_team"),
  subs_per_team: smallint("subs_per_team"),
  capacity: integer(),
  rsvp_closes_at: timestamp("rsvp_closes_at", {
    withTimezone: true,
    mode: "string",
  }),
  cancelled_reason: text("cancelled_reason"),
}).as(
  sql`SELECT id, season_id, kickoff_at, venue, status, players_per_team, subs_per_team, fixture_capacity(f.*) AS capacity, rsvp_closes_at, cancelled_reason FROM fixtures f`,
);

export const vSeasonsPublic = pgView("v_seasons_public", {
  id: uuid(),
  name: text(),
  started_on: date("started_on"),
  ended_on: date("ended_on"),
}).as(sql`SELECT id, name, started_on, ended_on FROM seasons s`);

export const vBadgesPublic = pgView("v_badges_public", {
  code: text(),
  name: text(),
  description: text(),
  emoji: text(),
  tier: text(),
  sort_order: smallint("sort_order"),
}).as(
  sql`SELECT code, name, description, emoji, tier, sort_order FROM badges b`,
);

export const vPlayerBadgesPublic = pgView("v_player_badges_public", {
  player_id: uuid("player_id"),
  badge_code: text("badge_code"),
  fixture_id: uuid("fixture_id"),
  earned_at: timestamp("earned_at", { withTimezone: true, mode: "string" }),
}).as(
  sql`SELECT player_id, badge_code, fixture_id, earned_at FROM player_badges pb`,
);

export const vFixtureTeamsPublic = pgView("v_fixture_teams_public", {
  id: uuid(),
  fixture_id: uuid("fixture_id"),
  side: text(),
  name: text(),
  colour: text(),
  goals: smallint(),
}).as(
  sql`SELECT id, fixture_id, side, name, colour, goals FROM fixture_teams ft`,
);

export const vPlayerMotmAwards = pgView("v_player_motm_awards", {
  player_id: uuid("player_id"),
  motm_awards: integer("motm_awards"),
}).as(
  sql`SELECT player_id, count(*)::integer AS motm_awards FROM v_fixture_motm m GROUP BY player_id`,
);

export const vTeamPlayersPublic = pgView("v_team_players_public", {
  fixture_team_id: uuid("fixture_team_id"),
  fixture_id: uuid("fixture_id"),
  player_id: uuid("player_id"),
  is_sub: boolean("is_sub"),
}).as(
  sql`SELECT fixture_team_id, fixture_id, player_id, is_sub FROM team_players tp`,
);

export const vRatingEventsPublic = pgView("v_rating_events_public", {
  player_id: uuid("player_id"),
  fixture_id: uuid("fixture_id"),
  rating_before: numeric("rating_before", { precision: 5, scale: 2 }),
  rating_after: numeric("rating_after", { precision: 5, scale: 2 }),
  delta: numeric({ precision: 5, scale: 2 }),
  reason: text(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }),
}).as(
  sql`SELECT player_id, fixture_id, rating_before, rating_after, delta, reason, created_at FROM rating_events e`,
);

export const vFixtureRsvps = pgView("v_fixture_rsvps", {
  fixture_id: uuid("fixture_id"),
  player_id: uuid("player_id"),
  display_name: text("display_name"),
  emoji: text(),
  rating: numeric({ precision: 5, scale: 2 }),
  status: text(),
  in_since: timestamp("in_since", { withTimezone: true, mode: "string" }),
  responded_at: timestamp("responded_at", {
    withTimezone: true,
    mode: "string",
  }),
  promoted_at: timestamp("promoted_at", { withTimezone: true, mode: "string" }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  squad_position: bigint("squad_position", { mode: "number" }),
  is_waitlisted: boolean("is_waitlisted"),
}).as(
  sql`SELECT r.fixture_id, r.player_id, p.display_name, p.emoji, p.rating, r.status, r.in_since, r.responded_at, r.promoted_at, CASE WHEN r.status <> 'in'::text THEN NULL::bigint ELSE row_number() OVER (PARTITION BY r.fixture_id ORDER BY r.in_since, r.created_at, r.player_id) END AS squad_position, CASE WHEN r.status <> 'in'::text THEN false ELSE row_number() OVER (PARTITION BY r.fixture_id ORDER BY r.in_since, r.created_at, r.player_id) > fixture_capacity(f.*) END AS is_waitlisted FROM rsvps r JOIN players p ON p.id = r.player_id JOIN fixtures f ON f.id = r.fixture_id`,
);

export const vPlayersPublic = pgView("v_players_public", {
  id: uuid(),
  display_name: text("display_name"),
  emoji: text(),
  rating: numeric({ precision: 5, scale: 2 }),
  is_active: boolean("is_active"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }),
}).as(
  sql`SELECT id, display_name, emoji, rating, is_active, created_at FROM players p`,
);

export const vFixtureMotm = pgView("v_fixture_motm", {
  fixture_id: uuid("fixture_id"),
  player_id: uuid("player_id"),
  votes: integer(),
}).as(
  sql`SELECT fixture_id, player_id, votes FROM ( SELECT v.fixture_id, v.player_id, v.votes, rank() OVER (PARTITION BY v.fixture_id ORDER BY v.votes DESC) AS "position" FROM v_fixture_motm_votes v JOIN fixtures f ON f.id = v.fixture_id AND f.status = 'played'::text) t WHERE "position" = 1`,
);

export const vSeasonTable = pgView("v_season_table", {
  season_id: uuid("season_id"),
  player_id: uuid("player_id"),
  display_name: text("display_name"),
  emoji: text(),
  rating: numeric({ precision: 5, scale: 2 }),
  appearances: integer(),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  own_goals: integer("own_goals"),
  motm_votes: integer("motm_votes"),
  wins: integer(),
  draws: integer(),
  losses: integer(),
  avg_self_rating: numeric("avg_self_rating"),
  last_played_at: timestamp("last_played_at", {
    withTimezone: true,
    mode: "string",
  }),
}).as(
  sql`SELECT s.season_id, s.player_id, p.display_name, p.emoji, p.rating, s.appearances, s.goals, s.assists, s.nutmegs, s.tackles, s.saves, s.own_goals, s.motm_votes, s.wins, s.draws, s.losses, s.avg_self_rating, s.last_played_at FROM v_player_season_stats s JOIN players p ON p.id = s.player_id WHERE p.is_active`,
);

export const vCareerTable = pgView("v_career_table", {
  player_id: uuid("player_id"),
  display_name: text("display_name"),
  emoji: text(),
  rating: numeric({ precision: 5, scale: 2 }),
  appearances: integer(),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  own_goals: integer("own_goals"),
  motm_votes: integer("motm_votes"),
  motm_awards: integer("motm_awards"),
  wins: integer(),
  draws: integer(),
  losses: integer(),
  avg_self_rating: numeric("avg_self_rating"),
  first_played_at: timestamp("first_played_at", {
    withTimezone: true,
    mode: "string",
  }),
  last_played_at: timestamp("last_played_at", {
    withTimezone: true,
    mode: "string",
  }),
}).as(
  sql`SELECT c.player_id, p.display_name, p.emoji, p.rating, c.appearances, c.goals, c.assists, c.nutmegs, c.tackles, c.saves, c.own_goals, c.motm_votes, COALESCE(a.motm_awards, 0) AS motm_awards, c.wins, c.draws, c.losses, c.avg_self_rating, c.first_played_at, c.last_played_at FROM v_player_career_stats c JOIN players p ON p.id = c.player_id LEFT JOIN v_player_motm_awards a ON a.player_id = c.player_id`,
);

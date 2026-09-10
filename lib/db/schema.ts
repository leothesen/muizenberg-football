/**
 * The database, as TypeScript.
 *
 * Introspected from the live schema with `pnpm drizzle:pull` rather than retyped, so
 * the columns, checks, partial indexes and expression indexes are the real ones. It
 * replaces the 1,640 lines of `lib/database.types.ts` that Supabase generated.
 *
 * TWO HAND-EDITS survive here, across three sites, and `drizzle:pull` will silently
 * undo every one of them if anyone regenerates this file. Re-apply them:
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
    telegramUserId: bigint("telegram_user_id", { mode: "number" }).notNull(),
    telegramUsername: text("telegram_username"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    displayName: text("display_name").notNull(),
    emoji: text().default("⚽").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    privateChatId: bigint("private_chat_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    rating: numeric({ precision: 5, scale: 2 }).default("65.00").notNull(),
  },
  (table) => [
    index("players_active_idx")
      .using("btree", table.isActive.asc().nullsLast().op("bool_ops"))
      .where(sql`is_active`),
    uniqueIndex("players_telegram_username_idx")
      .using("btree", sql`lower(telegram_username)`)
      .where(sql`(telegram_username IS NOT NULL)`),
    unique("players_telegram_user_id_key").on(table.telegramUserId),
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
    fixtureId: uuid("fixture_id").notNull(),
    playerId: uuid("player_id").notNull(),
    goals: smallint().default(0).notNull(),
    assists: smallint().default(0).notNull(),
    nutmegs: smallint().default(0).notNull(),
    tackles: smallint().default(0).notNull(),
    saves: smallint().default(0).notNull(),
    ownGoals: smallint("own_goals").default(0).notNull(),
    selfRating: smallint("self_rating"),
    motmPlayerId: uuid("motm_player_id"),
    reportedGoalsFor: smallint("reported_goals_for"),
    reportedGoalsAgainst: smallint("reported_goals_against"),
    flowState: text("flow_state").default("not_started").notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    flowMessageId: bigint("flow_message_id", { mode: "number" }),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("match_reports_fixture_idx").using(
      "btree",
      table.fixtureId.asc().nullsLast().op("uuid_ops"),
    ),
    index("match_reports_pending_idx")
      .using("btree", table.fixtureId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(submitted_at IS NULL)`),
    index("match_reports_player_idx").using(
      "btree",
      table.playerId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.fixtureId],
      foreignColumns: [fixtures.id],
      name: "match_reports_fixture_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.motmPlayerId],
      foreignColumns: [players.id],
      name: "match_reports_motm_player_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: "match_reports_player_id_fkey",
    }).onDelete("cascade"),
    unique("match_reports_fixture_id_player_id_key").on(
      table.fixtureId,
      table.playerId,
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
    sortOrder: smallint("sort_order").default(100).notNull(),
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
    playerId: uuid("player_id").notNull(),
    badgeCode: text("badge_code").notNull(),
    fixtureId: uuid("fixture_id"),
    earnedAt: timestamp("earned_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("player_badges_player_idx").using(
      "btree",
      table.playerId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.badgeCode],
      foreignColumns: [badges.code],
      name: "player_badges_badge_code_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.fixtureId],
      foreignColumns: [fixtures.id],
      name: "player_badges_fixture_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: "player_badges_player_id_fkey",
    }).onDelete("cascade"),
    unique("player_badges_player_id_badge_code_key").on(
      table.playerId,
      table.badgeCode,
    ),
  ],
);

export const ratingEvents = pgTable(
  "rating_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    playerId: uuid("player_id").notNull(),
    fixtureId: uuid("fixture_id"),
    ratingBefore: numeric("rating_before", {
      precision: 5,
      scale: 2,
    }).notNull(),
    ratingAfter: numeric("rating_after", { precision: 5, scale: 2 }).notNull(),
    delta: numeric({ precision: 5, scale: 2 }).notNull(),
    // drizzle-kit 0.31.10 emits `default(')` for an empty-string default, which is not
    // valid TypeScript. The database says `''::text`; every other string default in
    // this schema has content and round-tripped correctly.
    reason: text().default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("rating_events_player_idx").using(
      "btree",
      table.playerId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.fixtureId],
      foreignColumns: [fixtures.id],
      name: "rating_events_fixture_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: "rating_events_player_id_fkey",
    }).onDelete("cascade"),
    unique("rating_events_player_id_fixture_id_key").on(
      table.playerId,
      table.fixtureId,
    ),
  ],
);

export const seasons = pgTable(
  "seasons",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    startedOn: date("started_on").notNull(),
    endedOn: date("ended_on"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
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
    seasonId: uuid("season_id").notNull(),
    kickoffAt: timestamp("kickoff_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    venue: text().default("Muizenberg").notNull(),
    status: text().default("scheduled").notNull(),
    playersPerTeam: smallint("players_per_team").default(8).notNull(),
    subsPerTeam: smallint("subs_per_team").default(3).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    rsvpChatId: bigint("rsvp_chat_id", { mode: "number" }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    rsvpMessageId: bigint("rsvp_message_id", { mode: "number" }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    teamsMessageId: bigint("teams_message_id", { mode: "number" }),
    rsvpClosesAt: timestamp("rsvp_closes_at", {
      withTimezone: true,
      mode: "string",
    }),
    cancelledReason: text("cancelled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("fixtures_kickoff_idx").using(
      "btree",
      table.kickoffAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("fixtures_season_kickoff_idx").using(
      "btree",
      table.seasonId.asc().nullsLast().op("timestamptz_ops"),
      table.kickoffAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("fixtures_status_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.seasonId],
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
  ],
);

export const rsvps = pgTable(
  "rsvps",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    fixtureId: uuid("fixture_id").notNull(),
    playerId: uuid("player_id").notNull(),
    status: text().notNull(),
    inSince: timestamp("in_since", { withTimezone: true, mode: "string" }),
    promotedAt: timestamp("promoted_at", {
      withTimezone: true,
      mode: "string",
    }),
    respondedAt: timestamp("responded_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("rsvps_fixture_status_idx").using(
      "btree",
      table.fixtureId.asc().nullsLast().op("uuid_ops"),
      table.status.asc().nullsLast().op("timestamptz_ops"),
      table.inSince.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("rsvps_player_idx").using(
      "btree",
      table.playerId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.fixtureId],
      foreignColumns: [fixtures.id],
      name: "rsvps_fixture_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: "rsvps_player_id_fkey",
    }).onDelete("cascade"),
    unique("rsvps_fixture_id_player_id_key").on(
      table.fixtureId,
      table.playerId,
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
    fixtureId: uuid("fixture_id").notNull(),
    side: text().notNull(),
    name: text().notNull(),
    colour: text().default("hut-blue").notNull(),
    goals: smallint(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fixtureId],
      foreignColumns: [fixtures.id],
      name: "fixture_teams_fixture_id_fkey",
    }).onDelete("cascade"),
    unique("fixture_teams_fixture_id_side_key").on(table.fixtureId, table.side),
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
    fixtureTeamId: uuid("fixture_team_id").notNull(),
    playerId: uuid("player_id").notNull(),
    isSub: boolean("is_sub").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    fixtureId: uuid("fixture_id"),
  },
  (table) => [
    uniqueIndex("team_players_one_team_per_fixture_idx").using(
      "btree",
      table.fixtureId.asc().nullsLast().op("uuid_ops"),
      table.playerId.asc().nullsLast().op("uuid_ops"),
    ),
    index("team_players_player_idx").using(
      "btree",
      table.playerId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.fixtureId],
      foreignColumns: [fixtures.id],
      name: "team_players_fixture_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.fixtureTeamId],
      foreignColumns: [fixtureTeams.id],
      name: "team_players_fixture_team_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: "team_players_player_id_fkey",
    }).onDelete("cascade"),
    unique("team_players_fixture_team_id_player_id_key").on(
      table.fixtureTeamId,
      table.playerId,
    ),
  ],
);

export const telegramUpdates = pgTable(
  "telegram_updates",
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    updateId: bigint("update_id", { mode: "number" }).primaryKey().notNull(),
    kind: text(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("telegram_updates_received_idx").using(
      "btree",
      table.receivedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
  ],
);

export const botState = pgTable("bot_state", {
  key: text().primaryKey().notNull(),
  value: jsonb().default({}).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
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
    chatId: bigint("chat_id", { mode: "number" }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    receiverUserId: bigint("receiver_user_id", { mode: "number" }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    targetMessageId: bigint("target_message_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("telegram_emulator_messages_chat_idx").using(
      "btree",
      table.chatId.asc().nullsLast().op("int8_ops"),
      table.id.desc().nullsFirst().op("int8_ops"),
    ),
  ],
);
export const vFixtureMotmVotes = pgView("v_fixture_motm_votes", {
  fixtureId: uuid("fixture_id"),
  playerId: uuid("player_id"),
  votes: integer(),
}).as(
  sql`SELECT fixture_id, motm_player_id AS player_id, count(*)::integer AS votes FROM match_reports mr WHERE motm_player_id IS NOT NULL AND submitted_at IS NOT NULL GROUP BY fixture_id, motm_player_id`,
);

export const vPlayerFixtureStats = pgView("v_player_fixture_stats", {
  playerId: uuid("player_id"),
  fixtureId: uuid("fixture_id"),
  seasonId: uuid("season_id"),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true, mode: "string" }),
  side: text(),
  goalsFor: smallint("goals_for"),
  goalsAgainst: smallint("goals_against"),
  outcome: text(),
  isSub: boolean("is_sub"),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  ownGoals: integer("own_goals"),
  selfRating: smallint("self_rating"),
  motmVotes: integer("motm_votes"),
  reported: boolean(),
}).as(
  sql`SELECT tp.player_id, f.id AS fixture_id, f.season_id, f.kickoff_at, ft.side, ft.goals AS goals_for, opp.goals AS goals_against, CASE WHEN ft.goals IS NULL OR opp.goals IS NULL THEN NULL::text WHEN ft.goals > opp.goals THEN 'win'::text WHEN ft.goals < opp.goals THEN 'loss'::text ELSE 'draw'::text END AS outcome, tp.is_sub, COALESCE(mr.goals::integer, 0) AS goals, COALESCE(mr.assists::integer, 0) AS assists, COALESCE(mr.nutmegs::integer, 0) AS nutmegs, COALESCE(mr.tackles::integer, 0) AS tackles, COALESCE(mr.saves::integer, 0) AS saves, COALESCE(mr.own_goals::integer, 0) AS own_goals, mr.self_rating, COALESCE(v.votes, 0) AS motm_votes, mr.submitted_at IS NOT NULL AS reported FROM team_players tp JOIN fixtures f ON f.id = tp.fixture_id JOIN fixture_teams ft ON ft.id = tp.fixture_team_id JOIN fixture_teams opp ON opp.fixture_id = f.id AND opp.side <> ft.side LEFT JOIN match_reports mr ON mr.fixture_id = f.id AND mr.player_id = tp.player_id AND mr.submitted_at IS NOT NULL LEFT JOIN v_fixture_motm_votes v ON v.fixture_id = f.id AND v.player_id = tp.player_id WHERE f.status = 'played'::text`,
);

export const vPlayerSeasonStats = pgView("v_player_season_stats", {
  playerId: uuid("player_id"),
  seasonId: uuid("season_id"),
  appearances: integer(),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  ownGoals: integer("own_goals"),
  motmVotes: integer("motm_votes"),
  wins: integer(),
  draws: integer(),
  losses: integer(),
  avgSelfRating: numeric("avg_self_rating"),
  lastPlayedAt: timestamp("last_played_at", {
    withTimezone: true,
    mode: "string",
  }),
}).as(
  sql`SELECT player_id, season_id, count(*)::integer AS appearances, sum(goals)::integer AS goals, sum(assists)::integer AS assists, sum(nutmegs)::integer AS nutmegs, sum(tackles)::integer AS tackles, sum(saves)::integer AS saves, sum(own_goals)::integer AS own_goals, sum(motm_votes)::integer AS motm_votes, count(*) FILTER (WHERE outcome = 'win'::text)::integer AS wins, count(*) FILTER (WHERE outcome = 'draw'::text)::integer AS draws, count(*) FILTER (WHERE outcome = 'loss'::text)::integer AS losses, round(avg(self_rating), 2) AS avg_self_rating, max(kickoff_at) AS last_played_at FROM v_player_fixture_stats s GROUP BY player_id, season_id`,
);

export const vPlayerCareerStats = pgView("v_player_career_stats", {
  playerId: uuid("player_id"),
  appearances: integer(),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  ownGoals: integer("own_goals"),
  motmVotes: integer("motm_votes"),
  wins: integer(),
  draws: integer(),
  losses: integer(),
  avgSelfRating: numeric("avg_self_rating"),
  firstPlayedAt: timestamp("first_played_at", {
    withTimezone: true,
    mode: "string",
  }),
  lastPlayedAt: timestamp("last_played_at", {
    withTimezone: true,
    mode: "string",
  }),
}).as(
  sql`SELECT player_id, count(*)::integer AS appearances, sum(goals)::integer AS goals, sum(assists)::integer AS assists, sum(nutmegs)::integer AS nutmegs, sum(tackles)::integer AS tackles, sum(saves)::integer AS saves, sum(own_goals)::integer AS own_goals, sum(motm_votes)::integer AS motm_votes, count(*) FILTER (WHERE outcome = 'win'::text)::integer AS wins, count(*) FILTER (WHERE outcome = 'draw'::text)::integer AS draws, count(*) FILTER (WHERE outcome = 'loss'::text)::integer AS losses, round(avg(self_rating), 2) AS avg_self_rating, min(kickoff_at) AS first_played_at, max(kickoff_at) AS last_played_at FROM v_player_fixture_stats s GROUP BY player_id`,
);

export const vFixturesPublic = pgView("v_fixtures_public", {
  id: uuid(),
  seasonId: uuid("season_id"),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true, mode: "string" }),
  venue: text(),
  status: text(),
  playersPerTeam: smallint("players_per_team"),
  subsPerTeam: smallint("subs_per_team"),
  capacity: integer(),
  rsvpClosesAt: timestamp("rsvp_closes_at", {
    withTimezone: true,
    mode: "string",
  }),
  cancelledReason: text("cancelled_reason"),
}).as(
  sql`SELECT id, season_id, kickoff_at, venue, status, players_per_team, subs_per_team, fixture_capacity(f.*) AS capacity, rsvp_closes_at, cancelled_reason FROM fixtures f`,
);

export const vSeasonsPublic = pgView("v_seasons_public", {
  id: uuid(),
  name: text(),
  startedOn: date("started_on"),
  endedOn: date("ended_on"),
}).as(sql`SELECT id, name, started_on, ended_on FROM seasons s`);

export const vBadgesPublic = pgView("v_badges_public", {
  code: text(),
  name: text(),
  description: text(),
  emoji: text(),
  tier: text(),
  sortOrder: smallint("sort_order"),
}).as(
  sql`SELECT code, name, description, emoji, tier, sort_order FROM badges b`,
);

export const vPlayerBadgesPublic = pgView("v_player_badges_public", {
  playerId: uuid("player_id"),
  badgeCode: text("badge_code"),
  fixtureId: uuid("fixture_id"),
  earnedAt: timestamp("earned_at", { withTimezone: true, mode: "string" }),
}).as(
  sql`SELECT player_id, badge_code, fixture_id, earned_at FROM player_badges pb`,
);

export const vFixtureTeamsPublic = pgView("v_fixture_teams_public", {
  id: uuid(),
  fixtureId: uuid("fixture_id"),
  side: text(),
  name: text(),
  colour: text(),
  goals: smallint(),
}).as(
  sql`SELECT id, fixture_id, side, name, colour, goals FROM fixture_teams ft`,
);

export const vPlayerMotmAwards = pgView("v_player_motm_awards", {
  playerId: uuid("player_id"),
  motmAwards: integer("motm_awards"),
}).as(
  sql`SELECT player_id, count(*)::integer AS motm_awards FROM v_fixture_motm m GROUP BY player_id`,
);

export const vTeamPlayersPublic = pgView("v_team_players_public", {
  fixtureTeamId: uuid("fixture_team_id"),
  fixtureId: uuid("fixture_id"),
  playerId: uuid("player_id"),
  isSub: boolean("is_sub"),
}).as(
  sql`SELECT fixture_team_id, fixture_id, player_id, is_sub FROM team_players tp`,
);

export const vRatingEventsPublic = pgView("v_rating_events_public", {
  playerId: uuid("player_id"),
  fixtureId: uuid("fixture_id"),
  ratingBefore: numeric("rating_before", { precision: 5, scale: 2 }),
  ratingAfter: numeric("rating_after", { precision: 5, scale: 2 }),
  delta: numeric({ precision: 5, scale: 2 }),
  reason: text(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
}).as(
  sql`SELECT player_id, fixture_id, rating_before, rating_after, delta, reason, created_at FROM rating_events e`,
);

export const vFixtureRsvps = pgView("v_fixture_rsvps", {
  fixtureId: uuid("fixture_id"),
  playerId: uuid("player_id"),
  displayName: text("display_name"),
  emoji: text(),
  rating: numeric({ precision: 5, scale: 2 }),
  status: text(),
  inSince: timestamp("in_since", { withTimezone: true, mode: "string" }),
  respondedAt: timestamp("responded_at", {
    withTimezone: true,
    mode: "string",
  }),
  promotedAt: timestamp("promoted_at", { withTimezone: true, mode: "string" }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  squadPosition: bigint("squad_position", { mode: "number" }),
  isWaitlisted: boolean("is_waitlisted"),
}).as(
  sql`SELECT r.fixture_id, r.player_id, p.display_name, p.emoji, p.rating, r.status, r.in_since, r.responded_at, r.promoted_at, CASE WHEN r.status <> 'in'::text THEN NULL::bigint ELSE row_number() OVER (PARTITION BY r.fixture_id ORDER BY r.in_since, r.created_at, r.player_id) END AS squad_position, CASE WHEN r.status <> 'in'::text THEN false ELSE row_number() OVER (PARTITION BY r.fixture_id ORDER BY r.in_since, r.created_at, r.player_id) > fixture_capacity(f.*) END AS is_waitlisted FROM rsvps r JOIN players p ON p.id = r.player_id JOIN fixtures f ON f.id = r.fixture_id`,
);

export const vPlayersPublic = pgView("v_players_public", {
  id: uuid(),
  displayName: text("display_name"),
  emoji: text(),
  rating: numeric({ precision: 5, scale: 2 }),
  isActive: boolean("is_active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
}).as(
  sql`SELECT id, display_name, emoji, rating, is_active, created_at FROM players p`,
);

export const vFixtureMotm = pgView("v_fixture_motm", {
  fixtureId: uuid("fixture_id"),
  playerId: uuid("player_id"),
  votes: integer(),
}).as(
  sql`SELECT fixture_id, player_id, votes FROM ( SELECT v.fixture_id, v.player_id, v.votes, rank() OVER (PARTITION BY v.fixture_id ORDER BY v.votes DESC) AS "position" FROM v_fixture_motm_votes v JOIN fixtures f ON f.id = v.fixture_id AND f.status = 'played'::text) t WHERE "position" = 1`,
);

export const vSeasonTable = pgView("v_season_table", {
  seasonId: uuid("season_id"),
  playerId: uuid("player_id"),
  displayName: text("display_name"),
  emoji: text(),
  rating: numeric({ precision: 5, scale: 2 }),
  appearances: integer(),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  ownGoals: integer("own_goals"),
  motmVotes: integer("motm_votes"),
  wins: integer(),
  draws: integer(),
  losses: integer(),
  avgSelfRating: numeric("avg_self_rating"),
  lastPlayedAt: timestamp("last_played_at", {
    withTimezone: true,
    mode: "string",
  }),
}).as(
  sql`SELECT s.season_id, s.player_id, p.display_name, p.emoji, p.rating, s.appearances, s.goals, s.assists, s.nutmegs, s.tackles, s.saves, s.own_goals, s.motm_votes, s.wins, s.draws, s.losses, s.avg_self_rating, s.last_played_at FROM v_player_season_stats s JOIN players p ON p.id = s.player_id WHERE p.is_active`,
);

export const vCareerTable = pgView("v_career_table", {
  playerId: uuid("player_id"),
  displayName: text("display_name"),
  emoji: text(),
  rating: numeric({ precision: 5, scale: 2 }),
  appearances: integer(),
  goals: integer(),
  assists: integer(),
  nutmegs: integer(),
  tackles: integer(),
  saves: integer(),
  ownGoals: integer("own_goals"),
  motmVotes: integer("motm_votes"),
  motmAwards: integer("motm_awards"),
  wins: integer(),
  draws: integer(),
  losses: integer(),
  avgSelfRating: numeric("avg_self_rating"),
  firstPlayedAt: timestamp("first_played_at", {
    withTimezone: true,
    mode: "string",
  }),
  lastPlayedAt: timestamp("last_played_at", {
    withTimezone: true,
    mode: "string",
  }),
}).as(
  sql`SELECT c.player_id, p.display_name, p.emoji, p.rating, c.appearances, c.goals, c.assists, c.nutmegs, c.tackles, c.saves, c.own_goals, c.motm_votes, COALESCE(a.motm_awards, 0) AS motm_awards, c.wins, c.draws, c.losses, c.avg_self_rating, c.first_played_at, c.last_played_at FROM v_player_career_stats c JOIN players p ON p.id = c.player_id LEFT JOIN v_player_motm_awards a ON a.player_id = c.player_id`,
);

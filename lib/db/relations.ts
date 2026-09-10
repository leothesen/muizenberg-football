import { relations } from "drizzle-orm/relations";
import {
  fixtures,
  matchReports,
  players,
  badges,
  playerBadges,
  ratingEvents,
  seasons,
  rsvps,
  fixtureTeams,
  teamPlayers,
} from "./schema";

export const matchReportsRelations = relations(matchReports, ({ one }) => ({
  fixture: one(fixtures, {
    fields: [matchReports.fixtureId],
    references: [fixtures.id],
  }),
  player_motmPlayerId: one(players, {
    fields: [matchReports.motmPlayerId],
    references: [players.id],
    relationName: "matchReports_motmPlayerId_players_id",
  }),
  player_playerId: one(players, {
    fields: [matchReports.playerId],
    references: [players.id],
    relationName: "matchReports_playerId_players_id",
  }),
}));

export const fixturesRelations = relations(fixtures, ({ one, many }) => ({
  matchReports: many(matchReports),
  playerBadges: many(playerBadges),
  ratingEvents: many(ratingEvents),
  season: one(seasons, {
    fields: [fixtures.seasonId],
    references: [seasons.id],
  }),
  rsvps: many(rsvps),
  fixtureTeams: many(fixtureTeams),
  teamPlayers: many(teamPlayers),
}));

export const playersRelations = relations(players, ({ many }) => ({
  matchReports_motmPlayerId: many(matchReports, {
    relationName: "matchReports_motmPlayerId_players_id",
  }),
  matchReports_playerId: many(matchReports, {
    relationName: "matchReports_playerId_players_id",
  }),
  playerBadges: many(playerBadges),
  ratingEvents: many(ratingEvents),
  rsvps: many(rsvps),
  teamPlayers: many(teamPlayers),
}));

export const playerBadgesRelations = relations(playerBadges, ({ one }) => ({
  badge: one(badges, {
    fields: [playerBadges.badgeCode],
    references: [badges.code],
  }),
  fixture: one(fixtures, {
    fields: [playerBadges.fixtureId],
    references: [fixtures.id],
  }),
  player: one(players, {
    fields: [playerBadges.playerId],
    references: [players.id],
  }),
}));

export const badgesRelations = relations(badges, ({ many }) => ({
  playerBadges: many(playerBadges),
}));

export const ratingEventsRelations = relations(ratingEvents, ({ one }) => ({
  fixture: one(fixtures, {
    fields: [ratingEvents.fixtureId],
    references: [fixtures.id],
  }),
  player: one(players, {
    fields: [ratingEvents.playerId],
    references: [players.id],
  }),
}));

export const seasonsRelations = relations(seasons, ({ many }) => ({
  fixtures: many(fixtures),
}));

export const rsvpsRelations = relations(rsvps, ({ one }) => ({
  fixture: one(fixtures, {
    fields: [rsvps.fixtureId],
    references: [fixtures.id],
  }),
  player: one(players, {
    fields: [rsvps.playerId],
    references: [players.id],
  }),
}));

export const fixtureTeamsRelations = relations(
  fixtureTeams,
  ({ one, many }) => ({
    fixture: one(fixtures, {
      fields: [fixtureTeams.fixtureId],
      references: [fixtures.id],
    }),
    teamPlayers: many(teamPlayers),
  }),
);

export const teamPlayersRelations = relations(teamPlayers, ({ one }) => ({
  fixture: one(fixtures, {
    fields: [teamPlayers.fixtureId],
    references: [fixtures.id],
  }),
  fixtureTeam: one(fixtureTeams, {
    fields: [teamPlayers.fixtureTeamId],
    references: [fixtureTeams.id],
  }),
  player: one(players, {
    fields: [teamPlayers.playerId],
    references: [players.id],
  }),
}));

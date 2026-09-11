import { createElement, type ReactElement } from "react";
import { ratingTable } from "@/domain/leaderboards";
import { describeKickoff } from "@/domain/schedule";
import { settleFixture } from "@/domain/settle";
import { currentSeason } from "@/lib/repo/fixtures";
import { settlementContextFor } from "@/lib/repo/settlement";
import { careerTable, recentForm, badgesFor, seasonTable } from "@/lib/repo/stats";
import { teamsFor } from "@/lib/repo/teams";
import { buildPlayerCard, blankCard } from "@/lib/bot/fantasy";
import type { ImageSize } from "./layout";
import { LeaderboardImage, leaderboardSize } from "./leaderboard-image";
import { MatchReportImage, matchReportSize } from "./match-report-image";
import { PlayerCardImage, PLAYER_CARD_SIZE } from "./player-card";
import { TeamSheetImage, teamSheetSize } from "./team-sheet-image";
import { WelcomeImage, welcomeSize } from "./welcome-image";
import { leaderboardProps, matchReportProps, playerCardProps } from "./props";

/**
 * Assembling a picture from the database.
 *
 * One place that knows how to go from an id to a rendered element, shared by the bot
 * (which uploads the bytes) and the image routes (which serve them). Without it the
 * two would drift and the picture in the chat would stop matching the one on the web.
 */

export interface Scene {
  element: ReactElement;
  size: ImageSize;
}

export async function playerCardScene(playerId: string): Promise<Scene | null> {
  const [career, form, badges, season] = await Promise.all([
    careerTable(),
    recentForm(playerId),
    badgesFor(playerId),
    currentSeason(),
  ]);

  const mine = career.find((row) => row.playerId === playerId);
  const seasonName = season?.name ?? "";

  const card = mine
    ? buildPlayerCard({
        career: mine,
        form: form.map((f) => ({ outcome: f.outcome, delta: f.delta })),
        badges: badges.map((b) => ({ emoji: b.emoji, name: b.name })),
      })
    : null;

  if (!card) return null;

  return {
    element: createElement(PlayerCardImage, playerCardProps(card, seasonName)),
    size: PLAYER_CARD_SIZE,
  };
}

/** A card for somebody with no history yet, so a debutant still gets a picture. */
export function blankCardScene(
  player: { displayName: string; emoji: string; rating: number },
  seasonName: string,
): Scene {
  return {
    element: createElement(
      PlayerCardImage,
      playerCardProps(blankCard(player), seasonName),
    ),
    size: PLAYER_CARD_SIZE,
  };
}

/**
 * How the week works, for somebody who has just joined.
 *
 * Reads nothing, unlike every other scene here — the three stages are the shape of
 * the week itself, not this week's data, and a newcomer has no data yet. Synchronous
 * for the same reason.
 */
export function welcomeScene(): Scene {
  return { element: createElement(WelcomeImage), size: welcomeSize() };
}

export async function leaderboardScene(): Promise<Scene> {
  const season = await currentSeason();
  const rows = season ? await seasonTable(season.id) : [];
  const table = ratingTable(rows);

  return {
    element: createElement(
      LeaderboardImage,
      leaderboardProps(table, season?.name ?? "The table"),
    ),
    size: leaderboardSize(table.length),
  };
}

/**
 * The team sheet for a fixture whose teams are already stored.
 *
 * The pick cron builds this straight from `PickedTeams` instead — it has them in hand
 * and has not written them yet. Both paths render the same component, so the picture
 * in the chat and the one on the web cannot disagree.
 */
export async function teamSheetScene(params: {
  fixtureId: string;
  kickoffAt: Date;
  venue: string;
}): Promise<Scene | null> {
  const teams = await teamsFor(params.fixtureId);
  if (teams.length < 2) return null;

  const side = (stored: (typeof teams)[number]) => ({
    name: stored.team.name,
    colour: stored.team.colour,
    starters: stored.players.filter((p) => !p.isSub),
    subs: stored.players.filter((p) => p.isSub),
  });

  const a = teams.find((t) => t.team.side === "a");
  const b = teams.find((t) => t.team.side === "b");
  if (!a || !b) return null;

  const props = {
    a: side(a),
    b: side(b),
    kickoff: describeKickoff(params.kickoffAt),
    venue: params.venue,
  };

  return { element: createElement(TeamSheetImage, props), size: teamSheetSize(props) };
}

/**
 * Note that this re-derives the settlement rather than reading stored ratings. That is
 * safe only because the picture shows the score, the votes and the points — all of
 * which are functions of the reports alone. It must never grow a rating column: the
 * career totals a re-run sees now include the fixture itself, so the deltas it would
 * compute are not the ones that were actually applied.
 */
export async function matchReportScene(fixtureId: string, kickoffAt: Date): Promise<Scene | null> {
  const [context, teams] = await Promise.all([
    settlementContextFor(fixtureId),
    teamsFor(fixtureId),
  ]);
  if (!context) return null;

  const settlement = settleFixture(context);
  const a = teams.find((t) => t.team.side === "a");
  const b = teams.find((t) => t.team.side === "b");

  const props = matchReportProps(settlement, {
    kickoffAt,
    teamA: { name: a?.team.name ?? "Team A", colour: a?.team.colour ?? "hut-yellow" },
    teamB: { name: b?.team.name ?? "Team B", colour: b?.team.colour ?? "hut-blue" },
  });

  return { element: createElement(MatchReportImage, props), size: matchReportSize(props) };
}

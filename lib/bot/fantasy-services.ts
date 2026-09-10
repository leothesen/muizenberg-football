import type { SeasonStatRow } from "@/domain/leaderboards";
import type { CareerStatRow, FixtureStatRow, RecordHolder } from "@/domain/records";
import { currentSeason } from "@/lib/repo/fixtures";
import * as stats from "@/lib/repo/stats";
import { buildPlayerCard, blankCard } from "./fantasy";
import type { PlayerCardContext } from "./results";

/**
 * What the fantasy commands need from the outside world.
 *
 * Same shape as the other dependency bundles in this folder: an interface the router
 * takes, so `/table` and `/me` can be driven in a test with no database, and one
 * live implementation that reads the curated views.
 */
export interface FantasyDeps {
  currentSeason(): Promise<{ id: string; name: string } | null>;
  seasonTable(seasonId: string): Promise<SeasonStatRow[]>;
  careerTable(): Promise<CareerStatRow[]>;
  fixtureStatRows(): Promise<FixtureStatRow[]>;
  streakInputs(): Promise<{
    fixtureIdsOldestFirst: string[];
    byPlayer: Map<string, { holder: RecordHolder; fixtureIds: ReadonlySet<string> }>;
  }>;
  playerCard(player: {
    id: string;
    displayName: string;
    emoji: string;
    rating: number;
  }): Promise<PlayerCardContext>;
}

export function liveFantasyDeps(): FantasyDeps {
  return {
    currentSeason: async () => {
      const season = await currentSeason();
      return season ? { id: season.id, name: season.name } : null;
    },
    seasonTable: stats.seasonTable,
    careerTable: stats.careerTable,
    fixtureStatRows: stats.fixtureStatRows,
    streakInputs: stats.streakInputs,
    playerCard: livePlayerCard,
  };
}

async function livePlayerCard(player: {
  id: string;
  displayName: string;
  emoji: string;
  rating: number;
}): Promise<PlayerCardContext> {
  const [career, form, badges] = await Promise.all([
    stats.careerTable(),
    stats.recentForm(player.id),
    stats.badgesFor(player.id),
  ]);

  const mine = career.find((row) => row.playerId === player.id);
  if (!mine) return blankCard(player);

  return buildPlayerCard({
    career: mine,
    form: form.map((f) => ({ outcome: f.outcome, delta: f.delta })),
    badges: badges.map((b) => ({ emoji: b.emoji, name: b.name })),
  });
}

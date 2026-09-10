import type { Outcome } from "./types";

/**
 * Records and the hall of fame.
 *
 * The leaderboards answer "who is best right now". This answers "what is the best
 * thing that has ever happened here", which is the one people repeat in the pub. It
 * is therefore all-time and never resets with the season.
 *
 * A record with nobody in it is left out rather than shown as a zero: an empty hall
 * of fame full of "0 goals — nobody" is worse than a short one.
 */

/** One player's night, as recorded. */
export interface FixtureStatRow {
  playerId: string;
  displayName: string;
  emoji: string;
  fixtureId: string;
  kickoffAt: Date;
  goals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
  motmVotes: number;
  outcome: Outcome | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export interface CareerStatRow {
  playerId: string;
  displayName: string;
  emoji: string;
  appearances: number;
  goals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
  motmVotes: number;
  rating: number;
}

export interface RecordHolder {
  playerId: string;
  displayName: string;
  emoji: string;
}

export interface LeagueRecord {
  key: string;
  title: string;
  emoji: string;
  value: number;
  unit: string;
  /** Everyone who shares the record. */
  holders: RecordHolder[];
  /** The night it happened, for single-game records. */
  achievedAt: Date | null;
}

interface SingleGameRecordDefinition {
  key: string;
  title: string;
  emoji: string;
  unit: string;
  value: (row: FixtureStatRow) => number;
}

const SINGLE_GAME: SingleGameRecordDefinition[] = [
  { key: "most_goals_game", title: "Most goals in a game", emoji: "⚽", unit: "goals", value: (r) => r.goals },
  { key: "most_assists_game", title: "Most assists in a game", emoji: "🎁", unit: "assists", value: (r) => r.assists },
  { key: "most_nutmegs_game", title: "Most nutmegs in a game", emoji: "🥜", unit: "nutmegs", value: (r) => r.nutmegs },
  { key: "most_tackles_game", title: "Most tackles in a game", emoji: "🧱", unit: "tackles", value: (r) => r.tackles },
  { key: "most_saves_game", title: "Most saves in a game", emoji: "🧤", unit: "saves", value: (r) => r.saves },
];

interface CareerRecordDefinition {
  key: string;
  title: string;
  emoji: string;
  unit: string;
  value: (row: CareerStatRow) => number;
}

const CAREER: CareerRecordDefinition[] = [
  { key: "career_goals", title: "Most goals ever", emoji: "👟", unit: "goals", value: (r) => r.goals },
  { key: "career_assists", title: "Most assists ever", emoji: "🎩", unit: "assists", value: (r) => r.assists },
  { key: "career_nutmegs", title: "Most nutmegs ever", emoji: "🥜", unit: "nutmegs", value: (r) => r.nutmegs },
  { key: "career_caps", title: "Most appearances", emoji: "🦿", unit: "games", value: (r) => r.appearances },
  { key: "career_votes", title: "Most votes ever", emoji: "🏅", unit: "votes", value: (r) => r.motmVotes },
];

function holderOf(row: FixtureStatRow | CareerStatRow): RecordHolder {
  return { playerId: row.playerId, displayName: row.displayName, emoji: row.emoji };
}

function byName(a: RecordHolder, b: RecordHolder): number {
  return a.displayName.localeCompare(b.displayName);
}

export function singleGameRecords(rows: FixtureStatRow[]): LeagueRecord[] {
  const records: LeagueRecord[] = [];

  for (const definition of SINGLE_GAME) {
    const best = Math.max(0, ...rows.map(definition.value));
    if (best <= 0) continue;

    const matching = rows.filter((r) => definition.value(r) === best);
    // Several people can hold the same record; the date shown is the first time it
    // was done, because the record belongs to whoever got there first.
    const earliest = matching.reduce((a, b) => (a.kickoffAt <= b.kickoffAt ? a : b));

    records.push({
      key: definition.key,
      title: definition.title,
      emoji: definition.emoji,
      value: best,
      unit: definition.unit,
      holders: dedupeHolders(matching.map(holderOf)).sort(byName),
      achievedAt: earliest.kickoffAt,
    });
  }

  return records;
}

export function careerRecords(rows: CareerStatRow[]): LeagueRecord[] {
  const records: LeagueRecord[] = [];

  for (const definition of CAREER) {
    const best = Math.max(0, ...rows.map(definition.value));
    if (best <= 0) continue;

    const matching = rows.filter((r) => definition.value(r) === best);

    records.push({
      key: definition.key,
      title: definition.title,
      emoji: definition.emoji,
      value: best,
      unit: definition.unit,
      holders: dedupeHolders(matching.map(holderOf)).sort(byName),
      achievedAt: null,
    });
  }

  return records;
}

function dedupeHolders(holders: RecordHolder[]): RecordHolder[] {
  const seen = new Map<string, RecordHolder>();
  for (const holder of holders) {
    if (!seen.has(holder.playerId)) seen.set(holder.playerId, holder);
  }
  return [...seen.values()];
}

export interface MatchRecord {
  key: string;
  title: string;
  emoji: string;
  description: string;
  fixtureId: string;
  kickoffAt: Date;
  value: number;
}

/**
 * Records about the games themselves rather than the people in them. Derived from
 * the per-player rows because that is the only place the settled score is repeated
 * per fixture; duplicates collapse on fixture id.
 */
export function matchRecords(rows: FixtureStatRow[]): MatchRecord[] {
  const scored = new Map<string, { kickoffAt: Date; for: number; against: number }>();

  for (const row of rows) {
    if (row.goalsFor === null || row.goalsAgainst === null) continue;
    if (scored.has(row.fixtureId)) continue;
    scored.set(row.fixtureId, {
      kickoffAt: row.kickoffAt,
      for: row.goalsFor,
      against: row.goalsAgainst,
    });
  }

  const fixtures = [...scored.entries()].map(([fixtureId, s]) => ({
    fixtureId,
    kickoffAt: s.kickoffAt,
    total: s.for + s.against,
    margin: Math.abs(s.for - s.against),
    high: Math.max(s.for, s.against),
    low: Math.min(s.for, s.against),
  }));

  if (fixtures.length === 0) return [];

  const records: MatchRecord[] = [];

  const biggest = pickBest(fixtures, (f) => f.margin);
  if (biggest && biggest.margin > 0) {
    records.push({
      key: "biggest_win",
      title: "Biggest win",
      emoji: "💥",
      description: `${biggest.high}-${biggest.low}`,
      fixtureId: biggest.fixtureId,
      kickoffAt: biggest.kickoffAt,
      value: biggest.margin,
    });
  }

  const wildest = pickBest(fixtures, (f) => f.total);
  if (wildest) {
    records.push({
      key: "highest_scoring",
      title: "Most goals in one night",
      emoji: "🎢",
      description: `${wildest.high}-${wildest.low}`,
      fixtureId: wildest.fixtureId,
      kickoffAt: wildest.kickoffAt,
      value: wildest.total,
    });
  }

  return records;
}

function pickBest<T extends { kickoffAt: Date }>(
  items: T[],
  score: (item: T) => number,
): T | null {
  if (items.length === 0) return null;
  return items.reduce((best, item) => {
    const difference = score(item) - score(best);
    if (difference > 0) return item;
    // Earliest wins a tie: the record belongs to whoever did it first.
    if (difference === 0 && item.kickoffAt < best.kickoffAt) return item;
    return best;
  });
}

export interface HallOfFame {
  singleGame: LeagueRecord[];
  career: LeagueRecord[];
  matches: MatchRecord[];
}

export function hallOfFame(
  fixtureRows: FixtureStatRow[],
  careerRows: CareerStatRow[],
): HallOfFame {
  return {
    singleGame: singleGameRecords(fixtureRows),
    career: careerRecords(careerRows),
    matches: matchRecords(fixtureRows),
  };
}

/**
 * The longest run of consecutive appearances anyone has ever put together, computed
 * across the whole fixture list rather than only the current run.
 */
export interface StreakRecord {
  holders: RecordHolder[];
  length: number;
}

export function longestStreak(
  fixtureIdsOldestFirst: readonly string[],
  appearancesByPlayer: ReadonlyMap<string, { holder: RecordHolder; fixtureIds: ReadonlySet<string> }>,
): StreakRecord | null {
  let best = 0;
  let holders: RecordHolder[] = [];

  for (const { holder, fixtureIds } of appearancesByPlayer.values()) {
    let run = 0;
    let longest = 0;

    for (const fixtureId of fixtureIdsOldestFirst) {
      run = fixtureIds.has(fixtureId) ? run + 1 : 0;
      if (run > longest) longest = run;
    }

    if (longest > best) {
      best = longest;
      holders = [holder];
    } else if (longest === best && longest > 0) {
      holders.push(holder);
    }
  }

  if (best === 0) return null;
  return { holders: holders.sort(byName), length: best };
}

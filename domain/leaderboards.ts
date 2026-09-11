import type { Outcome } from "./types";

/**
 * The season leaderboards.
 *
 * A social kickabout does not have a league table, because the teams are different
 * every week. What it has instead is arguments, so the boards are built around the
 * arguments people actually have: who has scored the most, who nutmegs everyone, who
 * does the running nobody thanks them for.
 *
 * Two rules keep them honest. Ties share a rank rather than being broken by
 * something arbitrary, and boards that reward volume carry an appearance minimum so
 * one enormous night cannot win a season award.
 */

export interface SeasonStatRow {
  playerId: string;
  displayName: string;
  emoji: string;
  rating: number;
  appearances: number;
  goals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
  ownGoals: number;
  motmVotes: number;
  wins: number;
  draws: number;
  losses: number;
  avgSelfRating: number | null;
}

export type LeaderboardKey =
  | "goldenBoot"
  | "playmaker"
  | "nutmegKing"
  | "theWall"
  | "theGloves"
  | "peoplesChampion"
  | "ironman";

export interface LeaderboardDefinition {
  key: LeaderboardKey;
  title: string;
  emoji: string;
  /** One line explaining what wins it, shown under the title. */
  blurb: string;
  value: (row: SeasonStatRow) => number;
  /** Singular unit; the plural is the singular plus an "s" unless given. */
  unit: string;
  unitPlural?: string;
  /** Boards measuring a rate need a floor; boards measuring a total do not. */
  minAppearances?: number;
  /** The extra bit of context on each row, e.g. "0.8 a game". */
  detail?: (row: SeasonStatRow) => string;
}

const perGame = (total: number, appearances: number): string =>
  appearances > 0 ? `${(total / appearances).toFixed(1)} a game` : "";

export const LEADERBOARDS: readonly LeaderboardDefinition[] = [
  {
    key: "goldenBoot",
    title: "Golden Boot",
    emoji: "👟",
    blurb: "Most goals this season.",
    value: (r) => r.goals,
    unit: "goal",
    detail: (r) => perGame(r.goals, r.appearances),
  },
  {
    key: "playmaker",
    title: "Playmaker",
    emoji: "🎩",
    blurb: "Most assists — the pass before the glory.",
    value: (r) => r.assists,
    unit: "assist",
    detail: (r) => perGame(r.assists, r.appearances),
  },
  {
    key: "nutmegKing",
    title: "Nutmeg King",
    emoji: "🥜",
    blurb: "Most nutmegs. Purely for the disrespect.",
    value: (r) => r.nutmegs,
    unit: "nutmeg",
    detail: (r) => perGame(r.nutmegs, r.appearances),
  },
  {
    key: "theWall",
    title: "The Wall",
    emoji: "🧱",
    blurb: "Most tackles. Somebody has to do it.",
    value: (r) => r.tackles,
    unit: "tackle",
    detail: (r) => perGame(r.tackles, r.appearances),
  },
  {
    key: "theGloves",
    title: "The Gloves",
    emoji: "🧤",
    blurb: "Most saves, gathered across everyone's turn in goal.",
    value: (r) => r.saves,
    unit: "save",
    detail: (r) => perGame(r.saves, r.appearances),
  },
  {
    key: "peoplesChampion",
    title: "People's Champion",
    emoji: "🏅",
    blurb: "Most votes from everyone else.",
    value: (r) => r.motmVotes,
    unit: "vote",
  },
  {
    key: "ironman",
    title: "Ironman",
    emoji: "🦿",
    blurb: "Turned up the most. The award that actually matters.",
    value: (r) => r.appearances,
    unit: "game",
  },
];

export interface LeaderboardEntry {
  /** Competition ranking: 1, 2, 2, 4. */
  rank: number;
  playerId: string;
  displayName: string;
  emoji: string;
  value: number;
  detail: string;
}

export interface Leaderboard {
  key: LeaderboardKey;
  title: string;
  emoji: string;
  blurb: string;
  unit: string;
  unitPlural: string;
  entries: LeaderboardEntry[];
  /** True when nobody has done the thing yet. */
  empty: boolean;
}

export function definitionFor(key: LeaderboardKey): LeaderboardDefinition {
  const found = LEADERBOARDS.find((d) => d.key === key);
  if (!found) throw new Error(`Unknown leaderboard: ${key}`);
  return found;
}

export function buildLeaderboard(
  key: LeaderboardKey,
  rows: SeasonStatRow[],
  limit = 5,
): Leaderboard {
  const definition = definitionFor(key);
  const min = definition.minAppearances ?? 0;

  const scored = rows
    .filter((row) => row.appearances >= min)
    .map((row) => ({ row, value: definition.value(row) }))
    .filter((entry) => entry.value > 0)
    // Value first; then whoever did it in fewer games; then alphabetically so the
    // order never depends on how the database happened to return the rows.
    .sort(
      (a, b) =>
        b.value - a.value ||
        a.row.appearances - b.row.appearances ||
        a.row.displayName.localeCompare(b.row.displayName),
    );

  const entries: LeaderboardEntry[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;

  scored.forEach((entry, index) => {
    const rank = entry.value === lastValue ? lastRank : index + 1;
    lastValue = entry.value;
    lastRank = rank;

    entries.push({
      rank,
      playerId: entry.row.playerId,
      displayName: entry.row.displayName,
      emoji: entry.row.emoji,
      value: entry.value,
      detail: definition.detail?.(entry.row) ?? "",
    });
  });

  return {
    key,
    title: definition.title,
    emoji: definition.emoji,
    blurb: definition.blurb,
    unit: definition.unit,
    unitPlural: definition.unitPlural ?? `${definition.unit}s`,
    entries: entries.slice(0, limit),
    empty: entries.length === 0,
  };
}

export function allLeaderboards(rows: SeasonStatRow[], limit = 5): Leaderboard[] {
  return LEADERBOARDS.map((d) => buildLeaderboard(d.key, rows, limit));
}

/** The one-line winner of each board, for a season round-up. */
export interface AwardWinner {
  key: LeaderboardKey;
  title: string;
  emoji: string;
  /** More than one name when it is tied. */
  winners: LeaderboardEntry[];
  value: number;
  unit: string;
}

export function seasonAwards(rows: SeasonStatRow[]): AwardWinner[] {
  const awards: AwardWinner[] = [];

  for (const definition of LEADERBOARDS) {
    const board = buildLeaderboard(definition.key, rows, rows.length);
    if (board.empty) continue;

    const winners = board.entries.filter((e) => e.rank === 1);
    const value = winners[0]?.value ?? 0;

    awards.push({
      key: board.key,
      title: board.title,
      emoji: board.emoji,
      winners,
      value,
      unit: value === 1 ? board.unit : board.unitPlural,
    });
  }

  return awards;
}

/**
 * The rating table — the closest thing the league has to a standings page. Ranked on
 * the fantasy rating, which already folds in results, contribution and turning up.
 */
export interface TableRow {
  rank: number;
  playerId: string;
  displayName: string;
  emoji: string;
  rating: number;
  appearances: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
}

/**
 * Debutants sit out of the table until they have played this many games. Everybody
 * starts on the same 65, so without a floor a table would open with a wall of people
 * who have never kicked a ball.
 */
export const TABLE_MIN_APPEARANCES = 1;

export function ratingTable(rows: SeasonStatRow[], limit = 20): TableRow[] {
  return rows
    .filter((row) => row.appearances >= TABLE_MIN_APPEARANCES)
    .slice()
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        b.appearances - a.appearances ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      playerId: row.playerId,
      displayName: row.displayName,
      emoji: row.emoji,
      rating: row.rating,
      appearances: row.appearances,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goals: row.goals,
      assists: row.assists,
    }));
}

/** Form, newest game first. */
export type FormMark = "W" | "D" | "L";

export function formMark(outcome: Outcome | null): FormMark | null {
  if (outcome === "win") return "W";
  if (outcome === "draw") return "D";
  if (outcome === "loss") return "L";
  return null;
}

const FORM_DOTS: Record<FormMark, string> = { W: "🟢", D: "⚪", L: "🔴" };

/**
 * Form, oldest to newest, so it reads left to right like a results strip. Games with
 * no agreed score are left out rather than shown as a mystery, which would make the
 * strip lie about how many games were played.
 *
 * Marks rather than characters, because the website draws its own squares. Only the
 * chat, which can send nothing but text, needs the dots below.
 */
export function formMarks(
  outcomesNewestFirst: readonly (Outcome | null)[],
  length = 5,
): FormMark[] {
  return outcomesNewestFirst
    .map(formMark)
    .filter((m): m is FormMark => m !== null)
    .slice(0, length)
    .reverse();
}

/** The same window as a row of dots, for the chat. */
export function formStrip(outcomesNewestFirst: readonly (Outcome | null)[], length = 5): string {
  return formMarks(outcomesNewestFirst, length)
    .map((m) => FORM_DOTS[m])
    .join("");
}

export interface FormSummary {
  /** Sum of the rating changes over the window. */
  swing: number;
  trend: "rising" | "steady" | "falling";
  games: number;
}

/** Whether somebody is on the way up, in the rating's own units. */
export function formSummary(deltasNewestFirst: readonly number[], length = 5): FormSummary {
  const window = deltasNewestFirst.slice(0, length);
  const swing = Math.round(window.reduce((sum, d) => sum + d, 0) * 100) / 100;

  return {
    swing,
    trend: swing > 0.5 ? "rising" : swing < -0.5 ? "falling" : "steady",
    games: window.length,
  };
}

/**
 * A win-draw-loss record, in words.
 *
 * "4W 0D 2L" is second nature to anybody who has read a league table before and
 * completely opaque to somebody reading their first one — and half of it is usually
 * nought anyway. Zeroes are dropped, so a record reads as the things that happened.
 *
 * Lives here rather than beside either surface because the rendered leaderboard and
 * the website both print it, and two copies of a sentence like this drift.
 */
export function describeRecord(row: { wins: number; draws: number; losses: number }): string {
  const parts: string[] = [];
  if (row.wins > 0) parts.push(`${row.wins} won`);
  if (row.draws > 0) parts.push(`${row.draws} drew`);
  if (row.losses > 0) parts.push(`${row.losses} lost`);

  return parts.length > 0 ? parts.join(" · ") : "no games yet";
}

/**
 * What the little pictures mean.
 *
 * The bot counted six things and printed each as a bare emoji and a number: `3⚽ 1🥜
 * 4🧱`. Everybody knows the football. Almost nobody reads 🥜 as a nutmeg or 🧱 as a
 * tackle, and a stat somebody has to decode is a stat they skip — which quietly
 * wastes the entire point of asking them nine questions after the game.
 *
 * So the word travels with the emoji, everywhere, from one list. The emoji survives
 * because it makes a line scannable; the word is what makes it mean anything the
 * first time you see it.
 */

export interface StatKind {
  key: "goals" | "assists" | "nutmegs" | "tackles" | "saves" | "motmVotes";
  emoji: string;
  one: string;
  many: string;
  /** For a rendered column about 96px wide, where `many` would wrap or clip. */
  short: string;
}

/** In the order they are worth talking about. */
export const STAT_KINDS: readonly StatKind[] = [
  { key: "goals", emoji: "⚽", one: "goal", many: "goals", short: "goals" },
  { key: "assists", emoji: "🎁", one: "assist", many: "assists", short: "assists" },
  { key: "nutmegs", emoji: "🥜", one: "nutmeg", many: "nutmegs", short: "nutmegs" },
  { key: "tackles", emoji: "🧱", one: "tackle", many: "tackles", short: "tackles" },
  { key: "saves", emoji: "🧤", one: "save", many: "saves", short: "saves" },
  { key: "motmVotes", emoji: "⭐", one: "MOTM vote", many: "MOTM votes", short: "MOTM" },
] as const;

export type StatCounts = Record<StatKind["key"], number>;

/** "⚽ 2 goals", "🥜 1 nutmeg". */
export function statChip(kind: StatKind, count: number): string {
  return `${kind.emoji} ${count} ${count === 1 ? kind.one : kind.many}`;
}

/**
 * Everything that actually happened, in one line.
 *
 * Zeroes are left out rather than printed: a line of six noughts says nothing about a
 * player and buries the one number that does.
 */
export function statSummary(counts: Partial<StatCounts>): string {
  return STAT_KINDS.filter((kind) => (counts[kind.key] ?? 0) > 0)
    .map((kind) => statChip(kind, counts[kind.key]!))
    .join(" · ");
}

/**
 * All six, including the ones at nought.
 *
 * For a player card, where the empty columns are part of the picture — a striker with
 * no saves should see that, and next week's card is only interesting if you know what
 * it is counting.
 */
export function statGrid(counts: StatCounts): string[] {
  const chips = STAT_KINDS.map((kind) => statChip(kind, counts[kind.key]));
  return [chips.slice(0, 3).join("   "), chips.slice(3).join("   ")];
}

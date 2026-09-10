import type { CardAttributes } from "@/domain/rating";

/**
 * Arithmetic and text fitting for the rendered images.
 *
 * Split out from the JSX because this is the part that can be wrong in a way a
 * screenshot will not obviously show: a bar 3% too wide, a name that silently
 * overflows its box, an image sized for eight rows that is handed twenty.
 */

/** Attributes always appear in this order, so two cards can be compared side by side. */
export const ATTRIBUTE_ORDER: readonly (readonly [keyof CardAttributes, string])[] = [
  ["finishing", "FIN"],
  ["vision", "VIS"],
  ["flair", "FLA"],
  ["defending", "DEF"],
  ["keeping", "KEE"],
  ["reputation", "REP"],
] as const;

export interface AttributeRow {
  key: keyof CardAttributes;
  label: string;
  value: number;
  /** 0-100, for the bar. */
  percent: number;
}

/**
 * Attributes run 40-99, so a raw value read as a percentage would never show a bar
 * shorter than 40% and the whole scale would look compressed. Rescaled to the range
 * that is actually reachable.
 */
export const ATTRIBUTE_MIN = 40;
export const ATTRIBUTE_MAX = 99;

export function attributeRows(attributes: CardAttributes): AttributeRow[] {
  return ATTRIBUTE_ORDER.map(([key, label]) => ({
    key,
    label,
    value: attributes[key],
    percent: barPercent(attributes[key], ATTRIBUTE_MIN, ATTRIBUTE_MAX),
  }));
}

/** Clamped to 0-100 so a rogue value cannot push a bar out of its track. */
export function barPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const ratio = (value - min) / (max - min);
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

/**
 * Satori does not wrap or ellipsise for us in a fixed-width row, so long names are
 * cut here. The ellipsis is a single character, not three dots, so it costs one slot.
 */
export function fit(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * A list image grows with its content. Given a header, a per-row height and a footer,
 * this is the height that fits exactly — with a floor so a one-row leaderboard is
 * still a picture rather than a strip.
 */
export function listHeight(params: {
  rows: number;
  rowHeight: number;
  header: number;
  footer: number;
  minHeight?: number;
}): number {
  const natural = params.header + params.rows * params.rowHeight + params.footer;
  return Math.max(params.minHeight ?? 0, Math.round(natural));
}

/** Ordinal medals for the top three, then a plain number. */
export function rankLabel(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}`;
}

/**
 * How many rows an image will show. Beyond this a leaderboard stops being readable on
 * a phone, and the message below it carries the rest.
 */
export const MAX_IMAGE_ROWS = 12;

export function visibleRows<T>(rows: T[], max = MAX_IMAGE_ROWS): T[] {
  return rows.slice(0, max);
}

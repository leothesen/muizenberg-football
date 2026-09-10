/**
 * Text helpers for Telegram HTML messages.
 *
 * Display names come from Telegram and are attacker-controlled in the sense that
 * anybody can set their own to `<b>` or worse. Everything interpolated into an HTML
 * message goes through `escapeHtml` — the same discipline as any other HTML sink.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bold(text: string): string {
  return `<b>${escapeHtml(text)}</b>`;
}

export function italic(text: string): string {
  return `<i>${escapeHtml(text)}</i>`;
}

export function code(text: string): string {
  return `<code>${escapeHtml(text)}</code>`;
}

/** A player's name with their chosen emoji, safe to drop into a message. */
export function playerLabel(player: { displayName: string; emoji: string }): string {
  return `${player.emoji} ${escapeHtml(player.displayName)}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Joins with commas and a final "and". */
export function sentenceList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

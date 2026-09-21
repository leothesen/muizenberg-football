/**
 * Renders Telegram's HTML subset safely.
 *
 * Message text is built by this codebase and already escapes user content, but the
 * emulator injects it into a page, so it gets sanitised again rather than trusted.
 * Attributes are dropped entirely, which removes every event-handler and javascript:
 * vector at a stroke.
 *
 * The one attribute the bot does emit is the `href` of a mention —
 * `<a href="tg://user?id=…">Name</a>`, which is how the post-match message tags people
 * who have no username. Off Telegram that link goes nowhere, so an anchor becomes a
 * plain span: the name stays, the href goes, and nothing on the page is clickable.
 */

const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "br",
]);

export function sanitiseTelegramHtml(html: string): string {
  return html.replace(/<\/?([a-zA-Z0-9-]*)[^>]*>/g, (match, rawTag: string) => {
    const tag = rawTag.toLowerCase();

    if (tag === "a") return match.startsWith("</") ? "</span>" : "<span>";

    if (!ALLOWED_TAGS.has(tag)) {
      // Not a tag we emit: show it as literal text rather than dropping it, so a
      // mistake is visible instead of silently disappearing.
      return match.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    return match.startsWith("</") ? `</${tag}>` : `<${tag}>`;
  });
}

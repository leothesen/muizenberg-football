import { describe, expect, it } from "vitest";
import { sanitiseTelegramHtml } from "./render-html";

describe("sanitiseTelegramHtml", () => {
  it("keeps the formatting tags the bot actually emits", () => {
    expect(sanitiseTelegramHtml("<b>IN</b> and <i>maybe</i>")).toBe("<b>IN</b> and <i>maybe</i>");
    expect(sanitiseTelegramHtml("<code>/next</code>")).toBe("<code>/next</code>");
  });

  it("strips attributes, killing event handlers and javascript urls", () => {
    expect(sanitiseTelegramHtml('<b onclick="steal()">hi</b>')).toBe("<b>hi</b>");
    expect(sanitiseTelegramHtml('<b style="x">hi</b>')).toBe("<b>hi</b>");
  });

  it("neutralises a script tag instead of executing it", () => {
    const out = sanitiseTelegramHtml("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("neutralises an image with an onerror handler", () => {
    const out = sanitiseTelegramHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("neutralises anchors, since the bot never emits them", () => {
    const out = sanitiseTelegramHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("<a");
    expect(out).toContain("&lt;a");
  });

  it("leaves already-escaped user content alone", () => {
    expect(sanitiseTelegramHtml("&lt;b&gt;pwned&lt;/b&gt;")).toBe("&lt;b&gt;pwned&lt;/b&gt;");
  });

  it("escapes a stray angle-bracket pair rather than trusting it", () => {
    // escapeHtml already turns a real "<" into "&lt;" upstream, so this cannot occur
    // in a bot message. If it ever does, escaping is the safe reading, not passthrough.
    expect(sanitiseTelegramHtml("5 < 6 and 7 > 2")).toBe("5 &lt; 6 and 7 &gt; 2");
  });

  it("handles the real squad message unchanged", () => {
    const real = "⚽ <b>Football tomorrow</b>\nWednesday 16 September, 18:00 · Muizenberg";
    expect(sanitiseTelegramHtml(real)).toBe(real);
  });
});

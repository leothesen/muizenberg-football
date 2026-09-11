import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The fonts the pictures are drawn with.
 *
 * These are the one part of the image pipeline that can break in production while
 * every local check stays green: `pnpm build && next start` finds the files whether
 * or not anything was traced, because the whole source tree is still on disk. A
 * deployed function only receives what the tracer decided it needed.
 *
 * So this asserts both halves — that the files are really there and really fonts, and
 * that `next.config.js` still names the directory for the routes that render.
 */

const FONT_DIR = new URL("./fonts/", import.meta.url);

const EXPECTED = ["Archivo-Regular.ttf", "Archivo-Bold.ttf", "Archivo-ExtraBold.ttf"];

describe("the image fonts", () => {
  it("are all present", () => {
    const found = readdirSync(FONT_DIR);
    for (const name of EXPECTED) {
      expect(found, `${name} is missing from lib/og/fonts`).toContain(name);
    }
  });

  it("are real TrueType files, not an HTML error page saved by mistake", () => {
    for (const name of EXPECTED) {
      const bytes = readFileSync(new URL(name, FONT_DIR));

      // TrueType outlines start with the version tag 0x00010000; a download that
      // actually fetched a redirect or an error page starts with "<" or "{".
      expect(bytes.subarray(0, 4).toString("hex"), name).toBe("00010000");
      expect(bytes.byteLength, name).toBeGreaterThan(50_000);
    }
  });

  it("are distinct weights rather than the same file three times", () => {
    const sizes = EXPECTED.map((name) => readFileSync(new URL(name, FONT_DIR)).toString("base64"));
    expect(new Set(sizes).size).toBe(EXPECTED.length);
  });
});

describe("next.config.js", () => {
  it("traces the fonts into every route that renders a picture", () => {
    const config = readFileSync(new URL("../../next.config.js", import.meta.url), "utf8");

    expect(config).toContain("outputFileTracingIncludes");
    // The three families of route that reach `renderPng` or `imageResponse`: the
    // public image endpoints, the crons that post pictures into the chat, and the
    // webhook, which renders a card whenever somebody asks for one.
    for (const route of ["/api/og/**", "/api/cron/**", "/api/telegram/**"]) {
      expect(config, `${route} is not traced`).toContain(route);
    }
    expect(config).toContain("./lib/og/fonts/**");
  });
});

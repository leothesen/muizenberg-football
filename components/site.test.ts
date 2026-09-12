import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORM_COLOURS, HUT_ORDER, PALETTE, ratingColour } from "@/lib/og/theme";

/**
 * The palette runs on one rule: hut colours are fills, and the writing on them is
 * ink. That is how a painted hut works, and it is also the only way the brighter half
 * of the palette is legible at all — yellow lettering on pale sand is invisible.
 *
 * This used to be a test that two hardcoded colour lists agreed with each other. The
 * website now imports the same function the images use, so that drift is impossible
 * and the interesting question is no longer "do they match" but "can anybody read
 * it". These are the numbers that answer it.
 */

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Bold text at the size a rating chip is set. */
const LARGE_TEXT = 3;
const BODY_TEXT = 4.5;

describe("the rating chip", () => {
  it("is readable in ink at every band", () => {
    for (const rating of [40, 60, 70, 80, 90]) {
      const chip = ratingColour(rating);
      expect(contrast(chip, PALETTE.ink900), `rating ${rating} on ${chip}`).toBeGreaterThan(
        LARGE_TEXT,
      );
    }
  });

  it("separates every band from the one below it", () => {
    const bands = [50, 60, 70, 80, 90].map(ratingColour);
    expect(new Set(bands).size).toBe(5);
  });
});

describe("the huts", () => {
  it("are all visible against the sand they stand on", () => {
    for (const hut of HUT_ORDER) {
      expect(contrast(hut, PALETTE.sand50), hut).toBeGreaterThan(1.35);
    }
  });

  it("carry ink legibly, since nothing is ever written in hut paint", () => {
    for (const hut of HUT_ORDER) {
      expect(contrast(hut, PALETTE.ink900), hut).toBeGreaterThan(LARGE_TEXT);
    }
  });
});

describe("ink on sand", () => {
  it("clears body-text contrast for every text tone in use", () => {
    for (const ink of [PALETTE.ink900, PALETTE.ink700, PALETTE.ink500]) {
      expect(contrast(ink, PALETTE.sand50), ink).toBeGreaterThan(BODY_TEXT);
    }
  });
});

describe("the form strip", () => {
  it("tells a win from a loss from a draw", () => {
    const marks = [FORM_COLOURS.W, FORM_COLOURS.D, FORM_COLOURS.L];
    expect(new Set(marks).size).toBe(3);
  });

  it("keeps the drawn square visible on sand, where it is palest", () => {
    expect(contrast(FORM_COLOURS.D, PALETTE.sand50)).toBeGreaterThan(1.2);
  });
});

/**
 * The dark theme, read out of the stylesheet that actually ships.
 *
 * Parsed rather than re-declared here: a second copy of these numbers would pass this
 * test forever while the real page went unreadable. The explicit `[data-theme="dark"]`
 * block is the one somebody who picks "Dark" gets, and it repeats the media-query
 * values, so checking it covers both routes into the theme.
 */
function tokensIn(selector: string): Record<string, string> {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const start = css.indexOf(selector);
  expect(start, `${selector} is missing from globals.css`).toBeGreaterThan(-1);

  const block = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, string> = {};

  for (const [, name, channels] of block.matchAll(/--([\w-]+):\s*([\d\s]+);/g)) {
    const [r, g, b] = channels!.trim().split(/\s+/).map(Number);
    tokens[name!] = `#${[r, g, b]
      .map((c) => c!.toString(16).padStart(2, "0"))
      .join("")}`.toUpperCase();
  }

  return tokens;
}

/**
 * The drawing of Telegram.
 *
 * These three are the only colours in the app that are not sand, ink or hut paint,
 * and they exist because Telegram has a rule the sand scale cannot express: an
 * incoming bubble sits lighter than the wallpaper behind it in both of its themes,
 * where sand runs from the page ground outwards and swaps ends after dark. Drawn from
 * sand the bubble and the chat behind it landed on the *same value*, so a message was
 * a hairline border and nothing else.
 */
describe("the chat", () => {
  const themes = {
    light: tokensIn(":root {"),
    dark: tokensIn(':root[data-theme="dark"]'),
  };

  for (const [name, t] of Object.entries(themes)) {
    it(`puts the bubble lighter than the wallpaper, in ${name}`, () => {
      // The direction matters, not just the difference. A bubble darker than the
      // chat behind it is the one thing that reads as "not Telegram" instantly.
      expect(luminance(t["chat-bubble"]!)).toBeGreaterThan(luminance(t["chat-paper"]!));
    });

    it(`separates the bubble from the wallpaper, in ${name}`, () => {
      expect(contrast(t["chat-bubble"]!, t["chat-paper"]!)).toBeGreaterThan(1.25);
    });

    it(`keeps the sender's name readable on the bubble, in ${name}`, () => {
      // Telegram colours each sender and picks something that survives the theme.
      // Ours is a deep teal by day and a pale cyan after dark for exactly that
      // reason — one hue at both ends fails at one end.
      expect(contrast(t["chat-name"]!, t["chat-bubble"]!)).toBeGreaterThan(BODY_TEXT);
    });

    it(`keeps the message itself readable on the bubble, in ${name}`, () => {
      expect(contrast(t["ink-900"]!, t["chat-bubble"]!)).toBeGreaterThan(BODY_TEXT);
      // The timestamp in the corner is incidental text, so it gets the lower bar.
      expect(contrast(t["ink-400"]!, t["chat-bubble"]!)).toBeGreaterThan(LARGE_TEXT);
    });
  }
});

describe("after dark", () => {
  const dark = tokensIn(':root[data-theme="dark"]');

  it("defines every role the light theme does", () => {
    const roles = [
      "sand-50",
      "sand-100",
      "sand-200",
      "sand-300",
      "ink-900",
      "ink-700",
      "ink-500",
      "ink-400",
    ];

    for (const role of roles) {
      expect(dark[role], `--${role} is missing from the dark block`).toBeTruthy();
    }
  });

  it("keeps every text tone readable on the dark ground", () => {
    for (const role of ["ink-900", "ink-700", "ink-500"]) {
      expect(contrast(dark[role]!, dark["sand-50"]!), role).toBeGreaterThan(BODY_TEXT);
    }
    // The faintest tone only ever carries incidental text — a rank, a timestamp.
    expect(contrast(dark["ink-400"]!, dark["sand-50"]!)).toBeGreaterThan(LARGE_TEXT);
  });

  it("still shows a raised panel against the page behind it", () => {
    expect(contrast(dark["sand-100"]!, dark["sand-50"]!)).toBeGreaterThan(1.05);
  });

  it("never swaps the roles round", () => {
    // Sand is the surface and ink is what is written on it, in both themes. Getting
    // that backwards is how a themed palette ends up with pale text on a pale ground
    // on exactly one of the two settings.
    expect(contrast(dark["ink-900"]!, dark["sand-50"]!)).toBeGreaterThan(10);
  });

  it("leaves hut paint legible, and the writing on it dark in both themes", () => {
    for (const hut of HUT_ORDER) {
      // Paint reads as a fill against the dark ground...
      expect(contrast(hut, dark["sand-50"]!), hut).toBeGreaterThan(1.35);
      // ...and what is written on it is always the fixed dark, never the themed ink.
      expect(contrast(hut, PALETTE.ink900), hut).toBeGreaterThan(LARGE_TEXT);
    }
  });
});

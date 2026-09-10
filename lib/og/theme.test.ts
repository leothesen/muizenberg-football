import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTE, ratingBand, ratingColour, teamColour, TEAM_COLOURS } from "./theme";

describe("palette", () => {
  it("matches the Tailwind config, which is the other half of the same design", () => {
    // Satori cannot read Tailwind, so the values are duplicated here on purpose. This
    // is the test that stops the duplication becoming a divergence.
    const tailwind = readFileSync(new URL("../../tailwind.config.ts", import.meta.url), "utf8");

    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(tailwind.includes(hex), `${name} (${hex}) is not in tailwind.config.ts`).toBe(true);
    }
  });

  it("is all well-formed six-digit hex", () => {
    for (const hex of Object.values(PALETTE)) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("teamColour", () => {
  it("resolves the tokens the database stores", () => {
    expect(teamColour("hut-yellow")).toBe(PALETTE.hutYellow);
    expect(teamColour("hut-blue")).toBe(PALETTE.hutBlue);
  });

  it("falls back rather than rendering an undefined colour", () => {
    expect(teamColour("not-a-colour")).toBe(PALETTE.hutGreen);
  });

  it("covers every token in the map", () => {
    for (const token of Object.keys(TEAM_COLOURS)) {
      expect(teamColour(token)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("ratingColour", () => {
  it("changes band as the rating climbs", () => {
    const bands = [50, 60, 70, 80, 90].map(ratingColour);
    expect(new Set(bands).size).toBe(5);
  });

  it("never returns nothing, even at the extremes", () => {
    expect(ratingColour(0)).toMatch(/^#/);
    expect(ratingColour(999)).toMatch(/^#/);
  });
});

describe("ratingBand", () => {
  it("names each band", () => {
    expect(ratingBand(90)).toBe("Elite");
    expect(ratingBand(65)).toBe("Solid");
    expect(ratingBand(41)).toBe("Enthusiastic");
  });
});

import { describe, expect, it } from "vitest";
import { ratingClass } from "./site";
import { ratingColour } from "@/lib/og/theme";

/**
 * The website and the rendered images colour a rating with the same bands. They have
 * to be written twice — Tailwind classes on one side, hex literals for Satori on the
 * other — so this is the test that stops them drifting.
 */

const BAND_TO_TOKEN: Record<string, string> = {
  "text-hut-yellow": "#F4B942",
  "text-hut-green": "#2CB67D",
  "text-hut-blue": "#17A2CC",
  "text-hut-orange": "#F08A24",
  "text-hut-red": "#E4572E",
};

describe("ratingClass", () => {
  it("agrees with the colour the rendered cards use, at every boundary", () => {
    for (const rating of [40, 54, 55, 64, 65, 74, 75, 84, 85, 99]) {
      expect(BAND_TO_TOKEN[ratingClass(rating)], `rating ${rating}`).toBe(
        ratingColour(rating),
      );
    }
  });

  it("always returns a class, even for nonsense", () => {
    expect(ratingClass(-5)).toBe("text-hut-red");
    expect(ratingClass(1000)).toBe("text-hut-yellow");
  });
});

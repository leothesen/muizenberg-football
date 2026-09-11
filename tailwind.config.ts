import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Muizenberg's bathing boxes, at noon.
 *
 * This used to be the same seven colours over a floodlit-pitch-at-night ground, and
 * the two halves fought. Flat bright paint glows and muddies on near-black — in a
 * sixteen-row table half the squad came out the same warm smear, which defeats the
 * one job the colours have. The huts stand on pale sand in hard sunlight, so that is
 * the ground now.
 *
 * Two rules hold the system together:
 *
 *   1. Colour is identity, never decoration. A hut colour marks a person or a kit.
 *      Everything else is sand and ink.
 *   2. Hut colours are fills, never text. Yellow paint on pale sand is unreadable,
 *      and it is also simply how a painted hut works: the colour is the wall and the
 *      writing on it is dark.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./domain/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /** The beach. Warm, but greyed — beach sand, not a cream envelope. */
        sand: {
          50: "#FAF7F1",
          100: "#F1ECE1",
          200: "#E3DCCC",
          300: "#C9C0AC",
        },
        /**
         * Wet sand and False Bay water. Never pure black: nothing in the reference
         * photograph is, and pure black on warm sand reads as a printing error.
         */
        ink: {
          900: "#0F1E19",
          800: "#1B2E28",
          700: "#2E443C",
          500: "#5D6F67",
          400: "#83938B",
        },
        hut: {
          red: "#E4572E",
          orange: "#F08A24",
          yellow: "#F4B942",
          green: "#2CB67D",
          blue: "#17A2CC",
          indigo: "#4C6EF5",
          pink: "#E56399",
        },
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        /**
         * Nothing is rounded. A bathing box is a plank box with a pitched roof; it
         * has no radius, no shadow and no blur, and neither does this.
         */
        none: "0",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;

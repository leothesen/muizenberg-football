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
        /**
         * Roles, not literal colours — the values live in `app/globals.css` and swap
         * ends between the two themes. Sand runs from the page ground outwards to the
         * rules drawn on it; ink from the strongest text down to the faintest.
         *
         * Written as `rgb(var(--x) / <alpha-value>)` rather than `var(--x)` so the
         * opacity modifiers keep working: `border-ink-900/10` appears in a hundred
         * places and against a plain `var()` it silently produces nothing at all.
         */
        sand: {
          50: "rgb(var(--sand-50) / <alpha-value>)",
          100: "rgb(var(--sand-100) / <alpha-value>)",
          200: "rgb(var(--sand-200) / <alpha-value>)",
          300: "rgb(var(--sand-300) / <alpha-value>)",
        },
        ink: {
          900: "rgb(var(--ink-900) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
        },
        /**
         * What is written on hut paint, in both themes. A rating chip is a bright
         * fill with a near-black figure on it whether the lights are on or off.
         */
        "on-paint": "rgb(var(--on-paint) / <alpha-value>)",
        /**
         * The drawing of Telegram, which needs a wallpaper, a bubble that sits lighter
         * on it in both themes, and a readable sender colour. See `app/globals.css`
         * for why these cannot be sand steps.
         */
        chat: {
          paper: "rgb(var(--chat-paper) / <alpha-value>)",
          bubble: "rgb(var(--chat-bubble) / <alpha-value>)",
          name: "rgb(var(--chat-name) / <alpha-value>)",
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

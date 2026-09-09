import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Palette is Muizenberg's beach huts (the bright primaries on the sand) laid over a
 * floodlit-pitch-at-night ground. Phones in the dark are the main viewing context.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./domain/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pitch: {
          900: "#07110D",
          800: "#0B1A14",
          700: "#10261D",
          600: "#163527",
          500: "#1B4332",
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
        sand: "#F5EFE6",
        chalk: "#FDFCF8",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "1.25rem",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;

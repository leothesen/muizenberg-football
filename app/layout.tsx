import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import "./globals.css";

/**
 * One typeface, used across its whole weight range.
 *
 * Archivo is a grotesque drawn for signage and tables: it holds up at 11px in a
 * league table and at 120px on a scoreline, and its figures are properly tabular, so
 * columns of numbers line up without tricks. Geist was here before, which is the font
 * the framework ships with — a default rather than a decision.
 *
 * Deliberately not paired with a second face. The character in this design comes from
 * the huts, the flat blocks and the square corners; a display font on top of that
 * would be a third voice in a room that only needs one.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/**
 * No club name. This said "Muizenberg Football" over "The Wednesday night league",
 * which named both a place the group does not own and a night it stopped committing
 * to the moment it started voting on one.
 */
export const metadata: Metadata = {
  title: {
    default: "The league",
    template: "%s · The league",
  },
  description:
    "Squads, goals, nutmegs and bragging rights. Run entirely from the group chat.",
};

/**
 * The browser's own chrome — the address bar on a phone — follows the theme too.
 * A single value here left a bright bar sitting above a dark page.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF7F1" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1A16" },
  ],
};

/**
 * Only the document. The site header and footer live in the `(site)` group instead,
 * because the Mini App is not a page on a website — it opens inside Telegram, where a
 * navigation bar and a footer would be somebody else's furniture in your app.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        {/*
          Sets data-theme from the stored choice before anything paints. Without it a
          visitor who picked dark gets a full white page for one frame on every
          navigation — the flash is the whole reason this runs inline and blocking.

          suppressHydrationWarning above is the pair to it: this script changes the
          html element before React sees it, which React would otherwise report as a
          mismatch.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-sand-50 text-ink-900 antialiased">{children}</body>
    </html>
  );
}

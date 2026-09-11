import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
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

export const viewport: Viewport = {
  themeColor: "#FAF7F1",
};

/**
 * Only the document. The site header and footer live in the `(site)` group instead,
 * because the Mini App is not a page on a website — it opens inside Telegram, where a
 * navigation bar and a footer would be somebody else's furniture in your app.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-dvh bg-sand-50 text-ink-900 antialiased">{children}</body>
    </html>
  );
}

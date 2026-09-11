import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

/**
 * No club name here either. This said "Muizenberg Football" over "The Wednesday night
 * league", which named both a place the group does not own and a night it stopped
 * committing to the moment it started voting on one.
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
  themeColor: "#07110D",
};

/**
 * Only the document. The site header and footer live in the `(site)` group instead,
 * because the Mini App is not a page on a website — it opens inside Telegram, where a
 * navigation bar and a footer would be somebody else's furniture in your app.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

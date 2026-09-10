import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Muizenberg Football",
    template: "%s · Muizenberg Football",
  },
  description:
    "The Wednesday night league. Squads, stats and bragging rights for the Muizenberg football crew.",
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

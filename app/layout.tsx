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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className="min-h-dvh pitch-lines">{children}</body>
    </html>
  );
}

import Link from "next/link";
import { describeKickoff, relativeKickoff } from "@/domain/schedule";
import { formStrip } from "@/domain/leaderboards";
import type { Outcome } from "@/domain/types";

/**
 * The shared furniture of the website.
 *
 * Server components throughout: none of this needs to be interactive, and shipping
 * JavaScript to render a table of numbers would be a strange choice for a page that
 * is mostly read on a phone on a bad connection.
 */

const NAV = [
  { href: "/", label: "Home" },
  { href: "/table", label: "Table" },
  { href: "/players", label: "Players" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/records", label: "Records" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-chalk/10">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <Link href="/" className="font-mono text-xs uppercase tracking-[0.2em] text-hut-yellow">
          Wednesdays · Muizenberg
        </Link>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {NAV.slice(1).map((item) => (
            <Link key={item.href} href={item.href} className="text-chalk/70 hover:text-chalk">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-4xl px-5 pb-16 pt-10 text-xs text-chalk/40">
      Every number here was typed in by the player it belongs to, on trust. Run from the
      group chat.
    </footer>
  );
}

export function Page({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
      {lede ? <p className="mt-2 max-w-2xl text-chalk/60">{lede}</p> : null}
      <div className="mt-8">{children}</div>
    </main>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-chalk/10 bg-pitch-800/60 p-5">
      {title ? (
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-chalk/50">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-chalk/40">{children}</p>;
}

/**
 * Takes `playerId` rather than `id` because that is what every domain row already
 * calls it — leaderboard entries, table rows, per-fixture stats. Naming it the other
 * way would mean re-shaping an object at each of a dozen call sites.
 */
export function PlayerLink({
  player,
  className = "",
}: {
  player: { playerId: string; displayName: string; emoji: string };
  className?: string;
}) {
  return (
    <Link href={`/players/${player.playerId}`} className={`hover:text-hut-yellow ${className}`}>
      <span className="mr-2">{player.emoji}</span>
      {player.displayName}
    </Link>
  );
}

const FORM_LABEL: Record<string, string> = {
  "🟢": "Won",
  "⚪": "Drew",
  "🔴": "Lost",
};

/** The results strip, oldest on the left, exactly as the chat renders it. */
export function Form({ outcomes }: { outcomes: readonly (Outcome | null)[] }) {
  const strip = formStrip(outcomes);
  if (!strip) return <span className="text-chalk/30">—</span>;

  return (
    <span aria-label={[...strip].map((dot) => FORM_LABEL[dot] ?? "").join(", ")}>{strip}</span>
  );
}

export function Kickoff({ at, now }: { at: Date; now?: Date }) {
  return (
    <time dateTime={at.toISOString()}>
      {now ? relativeKickoff(at, now) : describeKickoff(at)}
    </time>
  );
}

/** A rating, coloured the same way the rendered cards colour it. */
export function Rating({ value }: { value: number }) {
  return <span className={ratingClass(value)}>{value.toFixed(1)}</span>;
}

export function ratingClass(rating: number): string {
  if (rating >= 85) return "text-hut-yellow";
  if (rating >= 75) return "text-hut-green";
  if (rating >= 65) return "text-hut-blue";
  if (rating >= 55) return "text-hut-orange";
  return "text-hut-red";
}

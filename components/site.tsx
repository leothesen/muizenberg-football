import Link from "next/link";
import { describeKickoff, relativeKickoff } from "@/domain/schedule";
import { formMarks } from "@/domain/leaderboards";
import type { Outcome } from "@/domain/types";
import { Hut, HutRow, HutStripe } from "@/components/huts";
import { FORM_COLOURS, ratingColour } from "@/lib/og/theme";
import { inviteUrl } from "@/lib/env";

/**
 * The shared furniture of the website.
 *
 * Server components throughout: none of this needs to be interactive, and shipping
 * JavaScript to render a table of numbers would be a strange choice for a page that
 * is mostly read on a phone on a bad connection.
 *
 * Nothing here is a card. Every block used to sit in its own rounded, bordered,
 * tinted box, which flattens a page into a grid of equal-weight containers and reads
 * as a template rather than a league. Sections are separated by a rule and by space.
 */

/** Public, and deliberately so — the footer invites people to change it. */
const REPO_URL = "https://github.com/leothesen/muizenberg-football";

const NAV = [
  { href: "/table", label: "Table" },
  { href: "/players", label: "Players" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/records", label: "Records" },
];

/**
 * The chrome carries the huts twice: the band across the very top, which is the same
 * one running along every picture the bot sends, and a short row of huts standing in
 * for a wordmark.
 *
 * There is no club name to set here yet. Five huts identify the place without naming
 * it, and leave room for a name when there is one.
 */
export function SiteHeader() {
  return (
    // `snap-start` is inert everywhere except a page that turns snapping on — the tour
    // on how-it-works — where it gives scrolling back to the top somewhere to land.
    <header className="snap-start">
      <HutStripe />
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-5">
        <Link href="/" className="flex items-center">
          <HutRow />
          <span className="sr-only">Home</span>
        </Link>
        <nav className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-medium">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/*
          Outlined rather than filled: the only filled button on the site is the one
          that actually puts you in the group, and two solid buttons competing in the
          same corner would make neither of them the thing to press.
        */}
        <Link
          href="/how-it-works"
          className="ml-auto border border-ink-900 px-3 py-1.5 text-sm font-semibold hover:bg-ink-900 hover:text-sand-50"
        >
          How it works
        </Link>
      </div>
    </header>
  );
}

/**
 * The one button on the site that does something irreversible-ish: it opens Telegram
 * and puts you in the group. Everything else is a link, so this is the only filled
 * thing anywhere and does not have to compete for attention.
 *
 * Opens in a new tab because it hands off to another app, and somebody who bounces
 * back should still have the page they were reading.
 */
export function JoinButton({ label = "Join the group on Telegram" }: { label?: string }) {
  return (
    <a
      href={inviteUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block bg-ink-900 px-6 py-3 font-semibold text-sand-50 hover:bg-ink-700"
    >
      {label}
    </a>
  );
}

/**
 * The width cap lives on an inner div, not on the `<footer>` itself.
 *
 * `mx-auto` on a direct child of a flex column cancels the default stretch and
 * shrinks the element to its content, so the whole footer floated to the middle of
 * the page while every other block stayed left-aligned.
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 snap-end pb-16">
      <div className="mx-auto max-w-5xl px-5">
        <div className="grid max-w-3xl gap-6 border-t border-ink-900/10 pt-5 text-sm text-ink-500 sm:grid-cols-2">
          <p>
            Every number here was typed in by the player it belongs to, on trust. Run
            from the group chat.
          </p>
          {/*
            The group is eleven people who mostly do not write software, so "open a
            pull request" is not the invitation. Pointing an agent at the repo and
            describing the change is, and it is worth saying out loud.
          */}
          <p>
            The whole thing is{" "}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-ink-300 underline-offset-4 hover:text-ink-900 hover:decoration-ink-900"
            >
              open on GitHub
            </a>
            . Want something changed? Clone it, point Claude Code at the folder, and
            tell it what you want — you do not have to know how any of this works.
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * A page's opening. The title is the largest thing on the page and the only thing at
 * that size, which is most of what gives a page a shape.
 */
export function Page({
  title,
  lede,
  eyebrow,
  action,
  children,
}: {
  title: string;
  lede?: string;
  eyebrow?: string;
  /** Sits directly under the lede, above the page's own spacing rhythm. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-5xl px-5 pt-8">
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-[clamp(2.25rem,6vw,3.5rem)] font-extrabold leading-[0.95] tracking-tight">
        {title}
      </h1>
      {lede ? <p className="mt-4 max-w-xl text-lg text-ink-700">{lede}</p> : null}
      {action ? <div className="mt-7">{action}</div> : null}
      <div className="mt-12 space-y-14">{children}</div>
    </main>
  );
}

/** A run of content under a heading and a rule. Not a box. */
export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      {title ? (
        <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-ink-900/15 pb-2">
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * The one exception to "not a card": a block that is a thing rather than a list — the
 * next fixture, the last result. A shade of sand deeper than the page, square, with
 * no border and no shadow, like the strip of beach in front of the huts.
 */
export function Shelf({ children }: { children: React.ReactNode }) {
  return <div className="sand-shelf p-6">{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-sm text-ink-500">{children}</p>;
}

/** A quiet link that still looks like one. */
export function More({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-ink-700 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900"
    >
      {children}
    </Link>
  );
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
    <Link
      href={`/players/${player.playerId}`}
      className={`inline-flex items-center gap-2.5 underline-offset-4 hover:underline ${className}`}
    >
      {/* Seeded on the display name, exactly as the rendered card seeds the frame
          around it, so the table and somebody's card come out the same colour. */}
      <Hut seed={player.displayName} />
      <span aria-hidden>{player.emoji}</span>
      <span className="font-medium">{player.displayName}</span>
    </Link>
  );
}

const FORM_LABEL: Record<string, string> = { W: "Won", D: "Drew", L: "Lost" };

/**
 * The results strip, oldest on the left.
 *
 * Squares of paint rather than the emoji circles the chat has to use: a browser can
 * draw its own, and a filled block is both smaller and clearer than an emoji that
 * renders differently on every phone.
 */
export function Form({ outcomes }: { outcomes: readonly (Outcome | null)[] }) {
  const marks = formMarks(outcomes);
  if (marks.length === 0) return <span className="text-ink-400">—</span>;

  return (
    <span
      className="inline-flex gap-1 align-middle"
      aria-label={marks.map((mark) => FORM_LABEL[mark]).join(", ")}
    >
      {marks.map((mark, index) => (
        <span
          key={`${mark}-${index}`}
          aria-hidden
          className="h-3 w-3"
          style={{ backgroundColor: FORM_COLOURS[mark] }}
        />
      ))}
    </span>
  );
}

export function Kickoff({ at, now }: { at: Date; now?: Date }) {
  return (
    <time dateTime={at.toISOString()}>
      {now ? relativeKickoff(at, now) : describeKickoff(at)}
    </time>
  );
}

/**
 * A rating, as a painted chip.
 *
 * The colour is a fill and the figure on it is ink, which is the rule the whole
 * palette runs on — the band colours are bright paint, and bright paint as lettering
 * on pale sand cannot be read. It also makes the band impossible to miss in a column
 * of forty numbers, which a coloured numeral never managed.
 */
export function Rating({ value }: { value: number }) {
  return (
    <span
      // `text-on-paint`, not `text-ink-900`. The band colour is the same bright fill
      // in both themes, so the figure on it has to stay dark in both — following ink
      // would put near-white lettering on yellow paint after dark.
      className="inline-flex min-w-[3.5rem] justify-center px-2 py-1 text-sm font-bold tabular-nums text-on-paint"
      style={{ backgroundColor: ratingColour(value) }}
    >
      {value.toFixed(1)}
    </span>
  );
}

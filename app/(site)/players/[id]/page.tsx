import Link from "next/link";
import { notFound } from "next/navigation";
import { describeKickoff } from "@/domain/schedule";
import { Empty, Form, Page, Rating, Section } from "@/components/site";
import { STAT_KINDS } from "@/lib/bot/stats";
import { hutFor } from "@/lib/og/theme";
import {
  badgesForPlayer,
  careerTable,
  fixtureStatRows,
  playerById,
  ratingHistory,
} from "@/lib/public/queries";

export const dynamic = "force-dynamic";

/**
 * Goals and assists stay on a phone; the rarer four appear when there is room. Same
 * reasoning as the season table — a nine-column table on a 390px screen is a
 * horizontal scrollbar pretending to be information.
 */
const NARROW_STATS: ReadonlySet<string> = new Set(["goals", "assists"]);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await playerById(id);
  return { title: player ? `${player.displayName}` : "Player" };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [player, career, badges, history, allRows] = await Promise.all([
    playerById(id),
    careerTable(),
    badgesForPlayer(id),
    ratingHistory(id),
    fixtureStatRows(),
  ]);

  if (!player) notFound();

  const mine = career.find((row) => row.playerId === id);
  const games = allRows
    .filter((row) => row.playerId === id)
    .sort((a, b) => b.kickoffAt.getTime() - a.kickoffAt.getTime());

  return (
    <Page eyebrow="Player" title={`${player.emoji} ${player.displayName}`}>
      <div className="grid gap-12 lg:grid-cols-[19rem_1fr]">
        <div>
          {/* The same card the bot posts into the chat, so the two never disagree. It
              already carries the attributes, the totals and the form strip — the panels
              beside it deliberately show what it cannot fit rather than repeating it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/og/card/${player.id}`}
            alt={`${player.displayName}'s player card`}
            className="w-full border"
            // Their hut: the same one the card frames itself in, and the same one
            // standing beside their name in the table.
            style={{ borderColor: hutFor(player.displayName) }}
          />
          <p className="mt-3 text-xs text-ink-500">
            Attributes come only from what the league actually measures, and are pulled
            towards the middle until there are enough games to trust the average.
          </p>
        </div>

        <div className="space-y-14">
          <Section title="Career">
            {mine ? (
              <dl className="grid grid-cols-3 gap-x-6 gap-y-7 sm:grid-cols-6">
                <Stat label="Games" value={mine.appearances} />
                <Stat label="Goals" value={mine.goals} />
                <Stat label="Assists" value={mine.assists} />
                <Stat label="Nutmegs" value={mine.nutmegs} />
                <Stat label="Tackles" value={mine.tackles} />
                <Stat label="Saves" value={mine.saves} />
              </dl>
            ) : (
              <Empty>Yet to play a game. Everything here fills in after the first one.</Empty>
            )}
          </Section>

          {badges.length > 0 ? (
            <Section title={badges.length === 1 ? "1 badge" : `${badges.length} badges`}>
              <ul className="flex flex-wrap gap-x-6 gap-y-3">
                {badges.map((badge) => (
                  <li key={badge.code} className="flex items-center gap-2 text-sm">
                    <span aria-hidden className="text-lg">
                      {badge.emoji}
                    </span>
                    <span className="font-medium">{badge.name}</span>
                    <span className="text-ink-500">{badge.description}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Every game">
            {games.length === 0 ? (
              <Empty>Nothing recorded yet. The bot asks what you did the morning after a game.</Empty>
            ) : (
              <div className="overflow-x-auto">
                {/*
                  Headers, not a row of pictures. Six bare emoji told a reader nothing
                  about which column was nutmegs and which was tackles. Driven off
                  STAT_KINDS, so the words here, the words on a card and the words in
                  the chat are one list.
                */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-900 text-xs uppercase tracking-[0.12em] text-ink-500">
                      <th className="py-2.5 text-left font-semibold">Date</th>
                      <th className="py-2.5 text-left font-semibold">Result</th>
                      {STAT_KINDS.map((kind) => (
                        <th
                          key={kind.key}
                          className={`py-2.5 pl-3 text-right font-semibold ${
                            NARROW_STATS.has(kind.key) ? "" : "hidden sm:table-cell"
                          }`}
                        >
                          {kind.many}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((game) => (
                      <tr key={game.fixtureId} className="border-b border-ink-900/10">
                        <td className="py-3">
                          <Link
                            href={`/fixtures/${game.fixtureId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {describeKickoff(game.kickoffAt)}
                          </Link>
                        </td>
                        <td className="py-3">
                          <Form outcomes={[game.outcome]} />
                          <span className="ml-2 tabular-nums text-ink-500">
                            {game.goalsFor === null
                              ? "—"
                              : `${game.goalsFor}–${game.goalsAgainst}`}
                          </span>
                        </td>
                        {STAT_KINDS.map((kind) => (
                          <td
                            key={kind.key}
                            className={`py-3 pl-3 text-right tabular-nums text-ink-700 ${
                              NARROW_STATS.has(kind.key) ? "" : "hidden sm:table-cell"
                            }`}
                          >
                            {game[kind.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {history.length > 0 ? (
            <Section title="Rating history">
              <ul>
                {history.map((event) => (
                  <li
                    key={`${event.fixtureId}-${event.at.toISOString()}`}
                    className="flex items-baseline gap-4 border-b border-ink-900/10 py-2.5 last:border-0"
                  >
                    {/*
                      The sign carries the direction, not a colour. Red and green
                      lettering on pale sand is under three to one — the same reason
                      every other colour in this design is a fill.
                    */}
                    <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                      {event.delta >= 0 ? "+" : "−"}
                      {Math.abs(event.delta).toFixed(2)}
                    </span>
                    <span className="shrink-0">
                      <Rating value={event.ratingAfter} />
                    </span>
                    <span className="flex-1 text-sm text-ink-500">{event.reason}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.12em] text-ink-500">{label}</dt>
      <dd className="mt-1 text-3xl font-extrabold tabular-nums leading-none">{value}</dd>
    </div>
  );
}

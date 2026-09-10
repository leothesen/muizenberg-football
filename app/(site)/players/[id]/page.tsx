import Link from "next/link";
import { notFound } from "next/navigation";
import { describeKickoff } from "@/domain/schedule";
import { Card, Empty, Form, Page, Rating } from "@/components/site";
import {
  badgesForPlayer,
  careerTable,
  fixtureStatRows,
  playerById,
  ratingHistory,
} from "@/lib/public/queries";

export const dynamic = "force-dynamic";

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
    <Page title={`${player.emoji} ${player.displayName}`}>
      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-3">
          {/* The same card the bot posts into the chat, so the two never disagree. It
              already carries the attributes, the totals and the form strip — the panels
              beside it deliberately show what it cannot fit rather than repeating it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/og/card/${player.id}`}
            alt={`${player.displayName}'s player card`}
            className="w-full rounded-card border border-chalk/10"
          />
          <p className="px-1 text-xs text-chalk/40">
            Attributes come only from what the league actually measures, and are pulled
            towards the middle until there are enough games to trust the average.
          </p>
        </div>

        <div className="space-y-5">
          <Card title="Career">
            {mine ? (
              <dl className="grid grid-cols-3 gap-y-4 sm:grid-cols-6">
                <Stat label="Games" value={mine.appearances} />
                <Stat label="Goals" value={mine.goals} />
                <Stat label="Assists" value={mine.assists} />
                <Stat label="Nutmegs" value={mine.nutmegs} />
                <Stat label="Tackles" value={mine.tackles} />
                <Stat label="Saves" value={mine.saves} />
              </dl>
            ) : (
              <Empty>Yet to play a game.</Empty>
            )}
          </Card>

          {badges.length > 0 ? (
            <Card title={`Badges (${badges.length})`}>
              <ul className="flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <li
                    key={badge.code}
                    title={badge.description}
                    className="rounded-full border border-chalk/10 bg-pitch-700 px-3 py-1.5 text-sm"
                  >
                    <span className="mr-1.5">{badge.emoji}</span>
                    {badge.name}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Every game">
            {games.length === 0 ? (
              <Empty>Nothing recorded yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-chalk/40">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 font-medium">Result</th>
                      <th className="py-2 text-right font-medium">⚽</th>
                      <th className="py-2 text-right font-medium">🎁</th>
                      <th className="py-2 text-right font-medium">🥜</th>
                      <th className="py-2 text-right font-medium">🧱</th>
                      <th className="py-2 text-right font-medium">🧤</th>
                      <th className="py-2 text-right font-medium">⭐</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-chalk/10">
                    {games.map((game) => (
                      <tr key={game.fixtureId}>
                        <td className="py-2.5">
                          <Link
                            href={`/fixtures/${game.fixtureId}`}
                            className="hover:text-hut-yellow"
                          >
                            {describeKickoff(game.kickoffAt)}
                          </Link>
                        </td>
                        <td className="py-2.5">
                          <Form outcomes={[game.outcome]} />
                          <span className="ml-2 text-chalk/50">
                            {game.goalsFor === null ? "—" : `${game.goalsFor}-${game.goalsAgainst}`}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-chalk/60">{game.goals}</td>
                        <td className="py-2.5 text-right text-chalk/60">{game.assists}</td>
                        <td className="py-2.5 text-right text-chalk/60">{game.nutmegs}</td>
                        <td className="py-2.5 text-right text-chalk/60">{game.tackles}</td>
                        <td className="py-2.5 text-right text-chalk/60">{game.saves}</td>
                        <td className="py-2.5 text-right text-chalk/60">{game.motmVotes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {history.length > 0 ? (
            <Card title="Rating history">
              <ul className="space-y-2 text-sm">
                {history.map((event) => (
                  <li
                    key={`${event.fixtureId}-${event.at.toISOString()}`}
                    className="flex items-baseline gap-3 border-b border-chalk/10 pb-2 last:border-0"
                  >
                    <span
                      className={`w-14 font-mono ${event.delta >= 0 ? "text-hut-green" : "text-hut-red"}`}
                    >
                      {event.delta >= 0 ? "+" : ""}
                      {event.delta.toFixed(2)}
                    </span>
                    <span className="w-12 font-mono text-chalk/50">
                      <Rating value={event.ratingAfter} />
                    </span>
                    <span className="flex-1 text-chalk/60">{event.reason}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-chalk/40">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

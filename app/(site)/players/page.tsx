import Link from "next/link";
import { Empty, Page, Rating, Section } from "@/components/site";
import { Hut } from "@/components/huts";
import { allPlayers, careerTable } from "@/lib/public/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Players" };

export default async function PlayersPage() {
  const [players, career] = await Promise.all([allPlayers(), careerTable()]);
  const stats = new Map(career.map((row) => [row.playerId, row] as const));

  const active = players.filter((p) => p.isActive);
  const former = players.filter((p) => !p.isActive);

  return (
    <Page
      eyebrow={active.length === 1 ? "1 in the league" : `${active.length} in the league`}
      title="Players"
      lede="Everybody in the group chat. There is no sign-up: being in the chat is being in the league."
    >
      <Section>
        {active.length === 0 ? (
          <Empty>Nobody yet. Anybody who joins the Telegram group turns up here.</Empty>
        ) : (
          <ul className="grid gap-x-12 sm:grid-cols-2">
            {active.map((player) => {
              const mine = stats.get(player.id);
              return (
                <li key={player.id} className="border-b border-ink-900/10">
                  <Link
                    href={`/players/${player.id}`}
                    className="group flex items-center gap-3 py-3"
                  >
                    <Hut seed={player.displayName} size={20} />
                    <span aria-hidden className="text-xl">
                      {player.emoji}
                    </span>
                    <span className="flex-1">
                      <span className="block font-medium underline-offset-4 group-hover:underline">
                        {player.displayName}
                      </span>
                      <span className="block text-xs text-ink-500">
                        {mine
                          ? `${mine.appearances} ${mine.appearances === 1 ? "game" : "games"} · ${mine.goals} ${mine.goals === 1 ? "goal" : "goals"}`
                          : "Yet to play"}
                      </span>
                    </span>
                    <Rating value={player.rating} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {former.length > 0 ? (
        <Section title="No longer in the chat">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-500">
            {former.map((player) => (
              <li key={player.id}>
                <Link
                  href={`/players/${player.id}`}
                  className="underline-offset-4 hover:text-ink-900 hover:underline"
                >
                  <span aria-hidden>{player.emoji}</span> {player.displayName}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </Page>
  );
}

import Link from "next/link";
import { Card, Empty, Page, Rating } from "@/components/site";
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
      title="Players"
      lede="Everybody in the group chat. There is no sign-up: being in the chat is being in the league."
    >
      <Card title={`${active.length} in the league`}>
        {active.length === 0 ? (
          <Empty>Nobody yet.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {active.map((player) => {
              const mine = stats.get(player.id);
              return (
                <li key={player.id}>
                  <Link
                    href={`/players/${player.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-chalk/5"
                  >
                    <Hut seed={player.displayName} size={18} />
                    <span className="text-2xl">{player.emoji}</span>
                    <span className="flex-1">
                      <span className="block">{player.displayName}</span>
                      <span className="block text-xs text-chalk/40">
                        {mine
                          ? `${mine.appearances} ${mine.appearances === 1 ? "game" : "games"} · ${mine.goals} ${mine.goals === 1 ? "goal" : "goals"}`
                          : "Yet to play"}
                      </span>
                    </span>
                    <span className="font-semibold">
                      <Rating value={player.rating} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {former.length > 0 ? (
        <div className="mt-5">
          <Card title="No longer in the chat">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-chalk/50">
              {former.map((player) => (
                <li key={player.id}>
                  <Link href={`/players/${player.id}`} className="hover:text-chalk">
                    {player.emoji} {player.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </Page>
  );
}

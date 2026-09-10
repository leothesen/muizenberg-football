import Link from "next/link";
import { ratingTable } from "@/domain/leaderboards";
import { Card, Empty, Kickoff, PlayerLink, Rating } from "@/components/site";
import {
  allFixtures,
  currentSeason,
  nextFixture,
  seasonTable,
  teamsForFixture,
} from "@/lib/public/queries";

export const dynamic = "force-dynamic";

/**
 * The front page answers the three questions anybody actually arrives with: when is
 * the next game, what happened last time, and who is top.
 */
export default async function HomePage() {
  const now = new Date();
  const [season, upcoming, fixtures] = await Promise.all([
    currentSeason(),
    nextFixture(now),
    allFixtures(),
  ]);

  const lastPlayed = fixtures.find((f) => f.status === "played");
  const [table, lastTeams] = await Promise.all([
    season ? seasonTable(season.id) : Promise.resolve([]),
    lastPlayed ? teamsForFixture(lastPlayed.id) : Promise.resolve([]),
  ]);

  const top = ratingTable(table, 5);

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-hut-yellow">
        {season?.name ?? "Wednesdays"} · Muizenberg
      </p>
      <h1 className="mt-3 text-5xl font-black tracking-tight sm:text-6xl">
        The Wednesday League
      </h1>
      <p className="mt-4 max-w-xl text-lg text-chalk/70">
        Squads, goals, nutmegs and bragging rights. Run entirely from the group chat.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <Card title="Next game">
          {upcoming ? (
            <div>
              <p className="text-2xl font-semibold">
                <Kickoff at={upcoming.kickoffAt} now={now} />
              </p>
              <p className="mt-1 text-chalk/60">
                <Kickoff at={upcoming.kickoffAt} /> · {upcoming.venue}
              </p>
              <p className="mt-4 text-sm text-chalk/50">
                {upcoming.status === "locked"
                  ? "Teams are picked."
                  : "The bot will ask the group the day before."}
              </p>
              <Link
                href={`/fixtures/${upcoming.id}`}
                className="mt-4 inline-block text-sm text-hut-blue hover:underline"
              >
                Fixture details
              </Link>
            </div>
          ) : (
            <Empty>Nothing on the books yet.</Empty>
          )}
        </Card>

        <Card title="Last time out">
          {lastPlayed && lastTeams.length === 2 ? (
            <div>
              <p className="text-2xl font-semibold">
                {lastTeams[0]?.goals ?? "?"} – {lastTeams[1]?.goals ?? "?"}
              </p>
              <p className="mt-1 text-chalk/60">
                {lastTeams[0]?.name} v {lastTeams[1]?.name}
              </p>
              <p className="mt-4 text-sm text-chalk/50">
                <Kickoff at={lastPlayed.kickoffAt} />
              </p>
              <Link
                href={`/fixtures/${lastPlayed.id}`}
                className="mt-4 inline-block text-sm text-hut-blue hover:underline"
              >
                Match report
              </Link>
            </div>
          ) : (
            <Empty>No games played yet.</Empty>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card
          title="Top of the table"
          action={
            <Link href="/table" className="text-sm text-hut-blue hover:underline">
              Full table
            </Link>
          }
        >
          {top.length === 0 ? (
            <Empty>The table starts on Wednesday.</Empty>
          ) : (
            <ol className="divide-y divide-chalk/10">
              {top.map((row) => (
                <li key={row.playerId} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 font-mono text-sm text-chalk/40">{row.rank}</span>
                  <PlayerLink player={row} className="flex-1" />
                  <span className="font-mono text-sm text-chalk/40">
                    {row.wins}W {row.draws}D {row.losses}L
                  </span>
                  <span className="w-14 text-right font-semibold">
                    <Rating value={row.rating} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </main>
  );
}

import { allLeaderboards, ratingTable } from "@/domain/leaderboards";
import { Card, Empty, Page, PlayerLink, Rating } from "@/components/site";
import { currentSeason, seasonTable } from "@/lib/public/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Table" };

export default async function TablePage() {
  const season = await currentSeason();
  const rows = season ? await seasonTable(season.id) : [];
  const table = ratingTable(rows, 50);
  const boards = allLeaderboards(rows, 5).filter((board) => !board.empty);

  return (
    <Page
      title={season?.name ?? "The table"}
      lede="Rating moves with results, what you contributed, and turning up. It is not a ladder anybody is meant to take too seriously."
    >
      <Card title="Season table">
        {table.length === 0 ? (
          <Empty>Nobody has played yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            {/*
              Words, not initials. P/W/D/L is second nature to anybody who has read a
              league table before and means nothing at all to somebody reading their
              first one — and ⚽/🎁 for goals and assists was a quiz even for people
              who had. The table scrolls sideways on a phone either way.
            */}
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-chalk/40">
                  <th className="w-8 py-2 font-medium">#</th>
                  <th className="py-2 font-medium">Player</th>
                  <th className="py-2 text-right font-medium">Played</th>
                  <th className="py-2 text-right font-medium">Won</th>
                  <th className="py-2 text-right font-medium">Drawn</th>
                  <th className="py-2 text-right font-medium">Lost</th>
                  <th className="py-2 text-right font-medium">Goals</th>
                  <th className="py-2 text-right font-medium">Assists</th>
                  <th className="py-2 text-right font-medium">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-chalk/10">
                {table.map((row) => (
                  <tr key={row.playerId}>
                    <td className="py-2.5 font-mono text-chalk/40">{row.rank}</td>
                    <td className="py-2.5">
                      <PlayerLink player={row} />
                    </td>
                    <td className="py-2.5 text-right text-chalk/60">{row.appearances}</td>
                    <td className="py-2.5 text-right text-chalk/60">{row.wins}</td>
                    <td className="py-2.5 text-right text-chalk/60">{row.draws}</td>
                    <td className="py-2.5 text-right text-chalk/60">{row.losses}</td>
                    <td className="py-2.5 text-right text-chalk/60">{row.goals}</td>
                    <td className="py-2.5 text-right text-chalk/60">{row.assists}</td>
                    <td className="py-2.5 text-right font-semibold">
                      <Rating value={row.rating} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {boards.map((board) => (
          <Card key={board.key} title={`${board.emoji} ${board.title}`}>
            <p className="mb-3 text-sm text-chalk/50">{board.blurb}</p>
            <ol className="divide-y divide-chalk/10">
              {board.entries.map((entry) => (
                <li key={entry.playerId} className="flex items-center gap-3 py-2">
                  <span className="w-5 font-mono text-sm text-chalk/40">{entry.rank}</span>
                  <PlayerLink player={entry} className="flex-1 text-sm" />
                  <span className="text-sm text-chalk/70">
                    {entry.value} {entry.value === 1 ? board.unit : board.unitPlural}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>

      {boards.length === 0 ? (
        <p className="mt-5 text-sm text-chalk/40">
          The leaderboards fill up once people start filing reports.
        </p>
      ) : null}
    </Page>
  );
}

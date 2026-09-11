import { allLeaderboards, ratingTable } from "@/domain/leaderboards";
import { Empty, Page, PlayerLink, Rating, Section } from "@/components/site";
import { currentSeason, seasonTable } from "@/lib/public/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Table" };

/**
 * The columns, as data.
 *
 * Written once so a header and its cells cannot disagree about which of them is
 * hidden on a phone — the classic way a responsive table ends up one column out of
 * alignment. Played, won and the rating survive the narrow view because they are what
 * the table is for; the rest appear when there is room.
 */
const COLUMNS = [
  { key: "appearances", label: "Played", narrow: true },
  { key: "wins", label: "Won", narrow: true },
  { key: "draws", label: "Drawn", narrow: false },
  { key: "losses", label: "Lost", narrow: false },
  { key: "goals", label: "Goals", narrow: false },
  { key: "assists", label: "Assists", narrow: false },
] as const;

export default async function TablePage() {
  const season = await currentSeason();
  const rows = season ? await seasonTable(season.id) : [];
  const table = ratingTable(rows, 50);
  const boards = allLeaderboards(rows, 5).filter((board) => !board.empty);

  return (
    <Page
      eyebrow="Season table"
      title={season?.name ?? "The table"}
      lede="Rating moves with results, what you contributed, and turning up. It is not a ladder anybody is meant to take too seriously."
    >
      <Section>
        {table.length === 0 ? (
          <Empty>
            Nobody has played yet. Everybody starts on the same rating and moves from
            the first result.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-900 text-xs uppercase tracking-[0.12em] text-ink-500">
                  <th className="w-8 py-2.5 text-left font-semibold">#</th>
                  <th className="py-2.5 text-left font-semibold">Player</th>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={`py-2.5 pl-3 text-right font-semibold ${
                        column.narrow ? "" : "hidden sm:table-cell"
                      }`}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th className="py-2.5 pl-3 text-right font-semibold">Rating</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.playerId} className="border-b border-ink-900/10">
                    <td className="py-3 tabular-nums text-ink-400">{row.rank}</td>
                    <td className="py-3">
                      <PlayerLink player={row} />
                    </td>
                    {COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`py-3 pl-3 text-right tabular-nums text-ink-700 ${
                          column.narrow ? "" : "hidden sm:table-cell"
                        }`}
                      >
                        {row[column.key]}
                      </td>
                    ))}
                    <td className="py-3 pl-3 text-right">
                      <Rating value={row.rating} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {boards.length === 0 ? (
        <Section title="Leaderboards">
          <Empty>
            These fill up once people start answering the questions the bot asks after
            a game.
          </Empty>
        </Section>
      ) : (
        <div className="grid gap-x-12 gap-y-14 sm:grid-cols-2">
          {/*
            The board's emoji is not printed beside its name. An emoji in front of a
            heading is decoration standing where a word should be, and every one of
            these headings already says what it is.
          */}
          {boards.map((board) => (
            <Section key={board.key} title={board.title}>
              <p className="-mt-1 mb-3 text-sm text-ink-500">{board.blurb}</p>
              <ol>
                {board.entries.map((entry) => (
                  <li
                    key={entry.playerId}
                    className="flex items-center gap-3 border-b border-ink-900/10 py-2.5 last:border-0"
                  >
                    <span className="w-4 text-sm tabular-nums text-ink-400">
                      {entry.rank}
                    </span>
                    <PlayerLink player={entry} className="flex-1 text-sm" />
                    <span className="text-sm tabular-nums text-ink-700">
                      {entry.value} {entry.value === 1 ? board.unit : board.unitPlural}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          ))}
        </div>
      )}
    </Page>
  );
}

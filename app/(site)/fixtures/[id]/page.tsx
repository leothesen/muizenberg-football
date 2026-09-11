import { notFound } from "next/navigation";
import { describeKickoff } from "@/domain/schedule";
import { PALETTE, teamColour } from "@/lib/og/theme";
import { Empty, Page, PlayerLink, Section } from "@/components/site";
import { STAT_KINDS } from "@/lib/bot/stats";
import {
  fixtureById,
  fixtureStatRows,
  motmForFixture,
  teamsForFixture,
  type PublicTeam,
} from "@/lib/public/queries";

export const dynamic = "force-dynamic";

/** Same narrow set as a player's history: the two everybody cares about survive. */
const NARROW_STATS: ReadonlySet<string> = new Set(["goals", "assists"]);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = await fixtureById(id);
  return { title: fixture ? describeKickoff(fixture.kickoffAt) : "Fixture" };
}

export default async function FixturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [fixture, teams, motm, allRows] = await Promise.all([
    fixtureById(id),
    teamsForFixture(id),
    motmForFixture(id),
    fixtureStatRows(),
  ]);

  if (!fixture) notFound();

  const a = teams.find((t) => t.side === "a");
  const b = teams.find((t) => t.side === "b");
  const settled = fixture.status === "played" && a?.goals !== null && b?.goals !== null;

  const rows = allRows
    .filter((row) => row.fixtureId === id)
    .sort(
      (x, y) =>
        y.goals - x.goals ||
        y.assists - x.assists ||
        x.displayName.localeCompare(y.displayName),
    );

  return (
    <Page eyebrow={fixture.venue} title={describeKickoff(fixture.kickoffAt)}>
      {fixture.status === "cancelled" ? (
        <p className="sand-shelf p-6 text-ink-700">
          Called off — {fixture.cancelledReason ?? "not enough players"}.
        </p>
      ) : null}

      {settled && a && b ? (
        <Section>
          {/* The rendered report the group saw, so the site and the chat agree. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/og/match/${fixture.id}`}
            alt={`${a.name} ${a.goals} ${b.name} ${b.goals}`}
            className="w-full border border-ink-900/15"
          />
        </Section>
      ) : null}

      {teams.length === 2 ? (
        <div className="grid gap-x-12 gap-y-14 sm:grid-cols-2">
          {teams.map((team) => (
            <TeamSheet key={team.id} team={team} settled={settled} />
          ))}
        </div>
      ) : (
        <Section title="Teams">
          <Empty>Teams have not been picked yet.</Empty>
        </Section>
      )}

      {motm.length > 0 ? (
        <Section title="Man of the match">
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            {motm.map((winner) => (
              <li key={winner.playerId} className="flex items-center gap-3">
                <PlayerLink player={winner} />
                <span className="text-sm text-ink-500">
                  {winner.votes} {winner.votes === 1 ? "vote" : "votes"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {rows.length > 0 ? (
        <Section title="What everyone said they did">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-900 text-xs uppercase tracking-[0.12em] text-ink-500">
                  <th className="py-2.5 text-left font-semibold">Player</th>
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
                {rows.map((row) => (
                  <tr key={row.playerId} className="border-b border-ink-900/10">
                    <td className="py-3">
                      <PlayerLink player={row} />
                    </td>
                    {STAT_KINDS.map((kind) => (
                      <td
                        key={kind.key}
                        className={`py-3 pl-3 text-right tabular-nums text-ink-700 ${
                          NARROW_STATS.has(kind.key) ? "" : "hidden sm:table-cell"
                        }`}
                      >
                        {row[kind.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-ink-500">
            Self-reported and unverified, on purpose. Nobody is checking.
          </p>
        </Section>
      ) : null}
    </Page>
  );
}

/**
 * A team sheet, not a card.
 *
 * The kit is a painted swatch beside an ink name, which is the rule the whole palette
 * runs on and is also what lets the white kit be white: on the old near-black ground
 * a white swatch was the only legible option and a black one disappeared, so the dark
 * kit had to be faked as a mid grey.
 */
function TeamSheet({ team, settled }: { team: PublicTeam; settled: boolean }) {
  const starters = team.players.filter((p) => !p.isSub);
  const subs = team.players.filter((p) => p.isSub);
  const colour = teamColour(team.colour);

  return (
    <section>
      <div className="mb-4 flex items-center gap-3 border-b border-ink-900/15 pb-2">
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 border"
          style={{
            backgroundColor: colour,
            // The light kit needs an edge or it is a hole in the page.
            borderColor: colour === PALETTE.sand50 ? PALETTE.ink400 : colour,
          }}
        />
        <h2 className="text-base font-bold tracking-tight">{team.name}</h2>
        {settled ? (
          <span className="ml-auto text-2xl font-extrabold tabular-nums leading-none">
            {team.goals}
          </span>
        ) : null}
      </div>

      <ul className="space-y-2">
        {starters.map((player) => (
          <li key={player.playerId}>
            <PlayerLink player={player} />
          </li>
        ))}
      </ul>

      {subs.length > 0 ? (
        <>
          <p className="mt-5 text-xs uppercase tracking-[0.12em] text-ink-500">Subs</p>
          <ul className="mt-2 space-y-2">
            {subs.map((player) => (
              <li key={player.playerId}>
                <PlayerLink player={player} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

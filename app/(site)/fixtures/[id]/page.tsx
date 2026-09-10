import { notFound } from "next/navigation";
import { describeKickoff } from "@/domain/schedule";
import { teamColour } from "@/lib/og/theme";
import { Card, Empty, Page, PlayerLink } from "@/components/site";
import {
  fixtureById,
  fixtureStatRows,
  motmForFixture,
  teamsForFixture,
  type PublicTeam,
} from "@/lib/public/queries";

export const dynamic = "force-dynamic";

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
    <Page title={describeKickoff(fixture.kickoffAt)} lede={fixture.venue}>
      {fixture.status === "cancelled" ? (
        <Card>
          <p className="text-chalk/70">
            Called off — {fixture.cancelledReason ?? "not enough players"}.
          </p>
        </Card>
      ) : null}

      {settled && a && b ? (
        <div className="mb-5">
          {/* The rendered report the group saw, so the site and the chat agree. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/og/match/${fixture.id}`}
            alt={`${a.name} ${a.goals} ${b.name} ${b.goals}`}
            className="w-full rounded-card border border-chalk/10"
          />
        </div>
      ) : null}

      {teams.length === 2 ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} settled={settled} />
          ))}
        </div>
      ) : (
        <Card>
          <Empty>Teams have not been picked yet.</Empty>
        </Card>
      )}

      {motm.length > 0 ? (
        <div className="mt-5">
          <Card title="Man of the match">
            <ul className="flex flex-wrap gap-4">
              {motm.map((winner) => (
                <li key={winner.playerId} className="flex items-center gap-2">
                  <span>⭐</span>
                  <PlayerLink player={winner} />
                  <span className="text-sm text-chalk/40">
                    {winner.votes} {winner.votes === 1 ? "vote" : "votes"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-5">
          <Card title="What everyone said they did">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-chalk/40">
                    <th className="py-2 font-medium">Player</th>
                    <th className="py-2 text-right font-medium">⚽</th>
                    <th className="py-2 text-right font-medium">🎁</th>
                    <th className="py-2 text-right font-medium">🥜</th>
                    <th className="py-2 text-right font-medium">🧱</th>
                    <th className="py-2 text-right font-medium">🧤</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-chalk/10">
                  {rows.map((row) => (
                    <tr key={row.playerId}>
                      <td className="py-2.5">
                        <PlayerLink player={row} />
                      </td>
                      <td className="py-2.5 text-right text-chalk/60">{row.goals}</td>
                      <td className="py-2.5 text-right text-chalk/60">{row.assists}</td>
                      <td className="py-2.5 text-right text-chalk/60">{row.nutmegs}</td>
                      <td className="py-2.5 text-right text-chalk/60">{row.tackles}</td>
                      <td className="py-2.5 text-right text-chalk/60">{row.saves}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-chalk/40">
              Self-reported and unverified, on purpose. Nobody is checking.
            </p>
          </Card>
        </div>
      ) : null}
    </Page>
  );
}

function TeamCard({ team, settled }: { team: PublicTeam; settled: boolean }) {
  const starters = team.players.filter((p) => !p.isSub);
  const subs = team.players.filter((p) => p.isSub);

  return (
    <Card>
      <div className="mb-4 flex items-baseline gap-3">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: teamColour(team.colour) }}
        />
        <h2 className="text-lg font-semibold">{team.name}</h2>
        {settled ? <span className="ml-auto text-2xl font-bold">{team.goals}</span> : null}
      </div>

      <ul className="space-y-1.5">
        {starters.map((player) => (
          <li key={player.playerId}>
            <PlayerLink player={player} />
          </li>
        ))}
      </ul>

      {subs.length > 0 ? (
        <>
          <p className="mt-4 text-xs uppercase tracking-wider text-chalk/40">Subs</p>
          <ul className="mt-1.5 space-y-1.5 text-chalk/60">
            {subs.map((player) => (
              <li key={player.playerId}>
                <PlayerLink player={player} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

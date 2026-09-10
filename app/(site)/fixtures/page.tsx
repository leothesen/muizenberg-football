import Link from "next/link";
import { describeKickoff } from "@/domain/schedule";
import { Card, Empty, Page } from "@/components/site";
import { allFixtures, teamsForFixture, type PublicTeam } from "@/lib/public/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fixtures" };

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  open: "Taking names",
  locked: "Teams picked",
  played: "Played",
  cancelled: "Called off",
};

export default async function FixturesPage() {
  const fixtures = await allFixtures();

  // Only settled games have a score worth fetching teams for.
  const scores = new Map<string, PublicTeam[]>(
    await Promise.all(
      fixtures
        .filter((f) => f.status === "played")
        .map(async (f) => [f.id, await teamsForFixture(f.id)] as const),
    ),
  );

  const upcoming = fixtures
    .filter((f) => f.status !== "played" && f.status !== "cancelled")
    .reverse();
  const past = fixtures.filter((f) => f.status === "played" || f.status === "cancelled");

  return (
    <Page title="Fixtures" lede="Every Wednesday, six o'clock, in Muizenberg.">
      {upcoming.length > 0 ? (
        <div className="mb-5">
          <Card title="Coming up">
            <ul className="divide-y divide-chalk/10">
              {upcoming.map((fixture) => (
                <li key={fixture.id} className="flex items-center gap-4 py-3">
                  <Link href={`/fixtures/${fixture.id}`} className="flex-1 hover:text-hut-yellow">
                    {describeKickoff(fixture.kickoffAt)}
                  </Link>
                  <span className="text-sm text-chalk/40">
                    {STATUS_LABEL[fixture.status] ?? fixture.status}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      <Card title="Results">
        {past.length === 0 ? (
          <Empty>No games played yet.</Empty>
        ) : (
          <ul className="divide-y divide-chalk/10">
            {past.map((fixture) => {
              const teams = scores.get(fixture.id);
              const a = teams?.find((t) => t.side === "a");
              const b = teams?.find((t) => t.side === "b");

              return (
                <li key={fixture.id} className="flex items-center gap-4 py-3">
                  <Link href={`/fixtures/${fixture.id}`} className="flex-1 hover:text-hut-yellow">
                    {describeKickoff(fixture.kickoffAt)}
                  </Link>

                  {fixture.status === "cancelled" ? (
                    <span className="text-sm text-chalk/40">
                      {fixture.cancelledReason ?? "Called off"}
                    </span>
                  ) : a?.goals !== null && a?.goals !== undefined && b?.goals !== null ? (
                    <span className="font-mono">
                      <span className="text-chalk/50">{a.name}</span>{" "}
                      <span className="font-semibold">
                        {a.goals}–{b?.goals}
                      </span>{" "}
                      <span className="text-chalk/50">{b?.name}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-chalk/40">No agreed score</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Page>
  );
}

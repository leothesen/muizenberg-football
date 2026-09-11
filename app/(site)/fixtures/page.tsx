import Link from "next/link";
import { describeKickoff } from "@/domain/schedule";
import { Empty, Page, Section } from "@/components/site";
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
    <Page
      eyebrow="Zandvlei Sports Ground"
      title="Fixtures"
      lede="The group votes on the night each week — half past five on a weeknight, five o'clock at the weekend."
    >
      {upcoming.length > 0 ? (
        <Section title="Coming up">
          <ul>
            {upcoming.map((fixture) => (
              <li
                key={fixture.id}
                className="flex items-baseline gap-4 border-b border-ink-900/10 py-3"
              >
                <Link
                  href={`/fixtures/${fixture.id}`}
                  className="flex-1 font-medium underline-offset-4 hover:underline"
                >
                  {describeKickoff(fixture.kickoffAt)}
                </Link>
                <span className="text-sm text-ink-500">
                  {STATUS_LABEL[fixture.status] ?? fixture.status}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Results">
        {past.length === 0 ? (
          <Empty>No games played yet.</Empty>
        ) : (
          <ul>
            {past.map((fixture) => {
              const teams = scores.get(fixture.id);
              const a = teams?.find((t) => t.side === "a");
              const b = teams?.find((t) => t.side === "b");
              const scored =
                a?.goals !== null && a?.goals !== undefined && b?.goals !== null;

              return (
                <li
                  key={fixture.id}
                  className="flex items-baseline gap-4 border-b border-ink-900/10 py-3"
                >
                  <Link
                    href={`/fixtures/${fixture.id}`}
                    className="flex-1 font-medium underline-offset-4 hover:underline"
                  >
                    {describeKickoff(fixture.kickoffAt)}
                  </Link>

                  {fixture.status === "cancelled" ? (
                    <span className="text-sm text-ink-500">
                      {fixture.cancelledReason ?? "Called off"}
                    </span>
                  ) : scored && a && b ? (
                    <span className="text-sm text-ink-500">
                      {a.name}{" "}
                      <span className="font-bold tabular-nums text-ink-900">
                        {a.goals}–{b.goals}
                      </span>{" "}
                      {b.name}
                    </span>
                  ) : (
                    <span className="text-sm text-ink-500">No agreed score</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </Page>
  );
}

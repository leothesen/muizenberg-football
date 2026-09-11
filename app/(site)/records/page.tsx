import { describeKickoff } from "@/domain/schedule";
import { hallOfFame, longestStreak, type LeagueRecord } from "@/domain/records";
import { Empty, Page, Section } from "@/components/site";
import { careerTable, fixtureStatRows, streakInputs } from "@/lib/public/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Records" };

export default async function RecordsPage() {
  const [fixtureRows, career, streaks] = await Promise.all([
    fixtureStatRows(),
    careerTable(),
    streakInputs(),
  ]);

  const fame = hallOfFame(fixtureRows, career);
  const streak = longestStreak(streaks.fixtureIdsOldestFirst, streaks.byPlayer);
  const anything =
    fame.singleGame.length > 0 || fame.career.length > 0 || fame.matches.length > 0;

  return (
    <Page
      eyebrow="All time, never reset"
      title="Hall of fame"
      lede="The things people still bring up months later."
    >
      {!anything ? (
        <Empty>Empty. Somebody go and do something memorable.</Empty>
      ) : (
        <div className="grid gap-x-12 gap-y-14 sm:grid-cols-2">
          {fame.singleGame.length > 0 ? (
            <Section title="One night only">
              <RecordList records={fame.singleGame} dated />
            </Section>
          ) : null}

          {fame.career.length > 0 ? (
            <Section title="All time">
              <RecordList records={fame.career} />
              {streak ? (
                <div className="border-b border-ink-900/10 py-3">
                  <p className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">Longest run</span>
                    <span className="tabular-nums">
                      {streak.length} {streak.length === 1 ? "game" : "games"} in a row
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {holderList(streak.holders)}
                  </p>
                </div>
              ) : null}
            </Section>
          ) : null}

          {fame.matches.length > 0 ? (
            <Section title="Nights nobody forgot">
              <ul>
                {fame.matches.map((record) => (
                  <li key={record.key} className="border-b border-ink-900/10 py-3">
                    <p className="flex items-baseline justify-between gap-4">
                      <span className="font-medium">{record.title}</span>
                      <span className="tabular-nums">{record.description}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {describeKickoff(record.kickoffAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
    </Page>
  );
}

/**
 * Holders are capped for the same reason the chat caps them: a record half the league
 * shares reads as a floor rather than a high-water mark, and eleven names is not a
 * record, it is a roll call.
 */
const MAX_HOLDERS = 3;

function holderList(holders: readonly { emoji: string; displayName: string }[]): string {
  const shown = holders.slice(0, MAX_HOLDERS).map((h) => `${h.emoji} ${h.displayName}`);
  const hidden = holders.length - shown.length;

  return hidden > 0
    ? `${shown.join(", ")} and ${hidden} ${hidden === 1 ? "other" : "others"}`
    : shown.join(", ");
}

/**
 * A record is a name and a number, so it is set as one: the thing on the left, the
 * figure on the right, holders underneath. The emoji each record carries is not
 * printed — it sat in front of the title doing the job the title already does.
 */
function RecordList({ records, dated = false }: { records: LeagueRecord[]; dated?: boolean }) {
  return (
    <ul>
      {records.map((record) => (
        <li key={record.key} className="border-b border-ink-900/10 py-3">
          <p className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{record.title}</span>
            <span className="shrink-0 tabular-nums">
              {record.value} {record.unit}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-ink-500">
            {holderList(record.holders)}
            {dated && record.achievedAt ? ` · ${describeKickoff(record.achievedAt)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

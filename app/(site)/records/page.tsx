import { describeKickoff } from "@/domain/schedule";
import { hallOfFame, longestStreak, type LeagueRecord } from "@/domain/records";
import { Card, Empty, Page } from "@/components/site";
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
      title="Hall of fame"
      lede="All-time, and never reset. The things people still bring up months later."
    >
      {!anything ? (
        <Card>
          <Empty>Empty. Somebody go and do something memorable.</Empty>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {fame.singleGame.length > 0 ? (
            <Card title="One night only">
              <RecordList records={fame.singleGame} dated />
            </Card>
          ) : null}

          {fame.career.length > 0 ? (
            <Card title="All time">
              <RecordList records={fame.career} />
              {streak ? (
                <div className="mt-3 border-t border-chalk/10 pt-3">
                  <p className="text-sm">
                    <span className="mr-2">🔥</span>
                    Longest run —{" "}
                    <span className="font-semibold">
                      {streak.length} {streak.length === 1 ? "game" : "games"}
                    </span>{" "}
                    in a row
                  </p>
                  <p className="mt-0.5 text-sm text-chalk/50">{holderList(streak.holders)}</p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {fame.matches.length > 0 ? (
            <Card title="Nights nobody forgot">
              <ul className="space-y-3">
                {fame.matches.map((record) => (
                  <li key={record.key}>
                    <p className="text-sm">
                      <span className="mr-2">{record.emoji}</span>
                      {record.title} —{" "}
                      <span className="font-semibold">{record.description}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-chalk/50">
                      {describeKickoff(record.kickoffAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
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

function RecordList({ records, dated = false }: { records: LeagueRecord[]; dated?: boolean }) {
  return (
    <ul className="space-y-3">
      {records.map((record) => (
        <li key={record.key}>
          <p className="text-sm">
            <span className="mr-2">{record.emoji}</span>
            {record.title} —{" "}
            <span className="font-semibold">
              {record.value} {record.unit}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-chalk/50">
            {holderList(record.holders)}
            {dated && record.achievedAt ? ` · ${describeKickoff(record.achievedAt)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

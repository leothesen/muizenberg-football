import { describeRecord, ratingTable } from "@/domain/leaderboards";
import {
  Empty,
  JoinButton,
  Kickoff,
  More,
  Page,
  PlayerLink,
  Rating,
  Section,
  Shelf,
} from "@/components/site";
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
 *
 * The next game is given more room than the last result because it is the only thing
 * on the page anybody can still act on.
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
    <Page
      eyebrow={season?.name ?? "This season"}
      title="The league"
      /*
        Second sentence earns its place on an empty league. In week one this page is
        three empty states and two buttons, and the only question a newcomer has —
        what would I actually have to do? — was answered nowhere on it, only behind a
        link most of them will never follow. Eight words is a cheap way to answer it
        for everybody who doesn't.
      */
      lede="Squads, goals, nutmegs and bragging rights. You tap three times a week; the bot does the rest."
      action={
        /*
          Joining the Telegram group is the whole sign-up, so the link to it is the
          only filled button on the site and it sits above everything a member came
          here for. A newcomer needs one thing from this page; a member scrolls past
          it to the table.
        */
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <JoinButton />
          {/*
            "How it works", not "See how a week works". The header button one row
            above points at this same page under the first name, and a visitor has no
            way to know the two labels are one destination — so they read as two
            things to investigate rather than one.
          */}
          <More href="/how-it-works">How it works</More>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1.45fr_1fr]">
        <Shelf>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            Next game
          </p>
          {upcoming ? (
            <>
              <p className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">
                <Kickoff at={upcoming.kickoffAt} now={now} />
              </p>
              <p className="mt-2 text-ink-700">
                <Kickoff at={upcoming.kickoffAt} />
              </p>
              <p className="text-ink-500">{upcoming.venue}</p>
              <p className="mt-5 text-sm text-ink-500">
                {upcoming.status === "locked"
                  ? "Teams are picked."
                  : "The bot will ask the group the day before."}
              </p>
              <p className="mt-5">
                <More href={`/fixtures/${upcoming.id}`}>Fixture details</More>
              </p>
            </>
          ) : (
            /*
              An empty state is the most-read screen this league will ever have: the
              database starts empty and stays that way until the first Monday. So it
              says what happens next rather than that nothing has happened.
            */
            <Empty>
              No game booked. The bot asks the group which night suits, on Monday
              afternoon.
            </Empty>
          )}
        </Shelf>

        <Shelf>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            Last time out
          </p>
          {lastPlayed && lastTeams.length === 2 ? (
            <>
              <p className="mt-3 text-5xl font-extrabold tabular-nums leading-none tracking-tight">
                {lastTeams[0]?.goals ?? "?"}–{lastTeams[1]?.goals ?? "?"}
              </p>
              <p className="mt-3 text-ink-700">
                {lastTeams[0]?.name} v {lastTeams[1]?.name}
              </p>
              <p className="text-sm text-ink-500">
                <Kickoff at={lastPlayed.kickoffAt} />
              </p>
              <p className="mt-5">
                <More href={`/fixtures/${lastPlayed.id}`}>Match report</More>
              </p>
            </>
          ) : (
            <Empty>Nothing played yet. The first result lands here the morning after.</Empty>
          )}
        </Shelf>
      </div>

      <Section title="Top of the table" action={<More href="/table">Full table</More>}>
        {top.length === 0 ? (
          <Empty>
            Nobody has played yet. The table fills itself in from what people report
            after each game.
          </Empty>
        ) : (
          <ol>
            {top.map((row) => (
              <li
                key={row.playerId}
                className="flex items-center gap-4 border-b border-ink-900/10 py-3"
              >
                <span className="w-5 text-sm tabular-nums text-ink-400">{row.rank}</span>
                <PlayerLink player={row} className="flex-1" />
                <span className="hidden text-sm text-ink-500 sm:inline">
                  {describeRecord(row)}
                </span>
                <Rating value={row.rating} />
              </li>
            ))}
          </ol>
        )}
      </Section>
    </Page>
  );
}

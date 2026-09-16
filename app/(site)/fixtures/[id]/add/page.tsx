import { notFound } from "next/navigation";
import Link from "next/link";
import { describeKickoff } from "@/domain/schedule";
import { DEFAULT_VENUE, venueFor } from "@/domain/venues";
import { googleCalendarUrl } from "@/lib/calendar/links";
import { Page, Section } from "@/components/site";
import { fixtureById } from "@/lib/public/queries";

export const dynamic = "force-dynamic";

/**
 * "Add to calendar", which for months did nothing.
 *
 * The button on the poll used to point straight at the .ics. Telegram opens a URL
 * button inside its own browser, and that browser has nowhere to put a downloaded
 * file — so the tap ended on a blank screen and the feature quietly became a joke.
 *
 * One page with two ways out instead. Google publishes a URL that opens a filled-in
 * new-event screen, which is one tap for most of the group and never touches a file.
 * Apple has no such URL — there is no scheme that creates an event in iOS Calendar —
 * so an iPhone gets the .ics, which now works because the route serves it inline.
 *
 * The extra tap is the price of the thing working on every phone in the group, and
 * this page is the only place that can explain the in-app browser to somebody it has
 * just failed for.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = await fixtureById(id);
  return { title: fixture ? `Add ${describeKickoff(fixture.kickoffAt)}` : "Add to calendar" };
}

export default async function AddToCalendarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fixture = await fixtureById(id);

  if (!fixture) notFound();

  // The coordinates are not in the public view, and do not need to be: the pin for
  // the ground the league actually plays on is a constant, and for anywhere else
  // Google geocodes the name. The .ics below carries whatever pin the fixture has.
  const venue = venueFor(fixture.venue) ?? {
    name: fixture.venue || DEFAULT_VENUE.name,
    lat: null,
    lon: null,
    mapsUrl: null,
  };

  const cancelled = fixture.status === "cancelled";

  return (
    <Page eyebrow={venue.name} title={describeKickoff(fixture.kickoffAt)}>
      {cancelled ? (
        <p className="sand-shelf p-6 text-ink-700">
          This one is off — {fixture.cancelledReason ?? "not enough players"}. You can
          still save it; your calendar will show it as cancelled.
        </p>
      ) : null}

      <Section title="Put it in your calendar">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <a
              href={googleCalendarUrl({ kickoffAt: fixture.kickoffAt, venue })}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-ink-900 px-6 py-3 text-center font-semibold text-sand-50 hover:bg-ink-700"
            >
              Google Calendar
            </a>
            <p className="mt-3 text-sm text-ink-500">
              Opens the new-event screen with everything filled in. You press save. If
              the group moves the night, come back and add the new one.
            </p>
          </div>

          <div>
            <a
              href={`/api/fixtures/${fixture.id}/calendar`}
              className="block border border-ink-900 px-6 py-3 text-center font-semibold hover:bg-ink-900 hover:text-sand-50"
            >
              Apple, Outlook, everything else
            </a>
            <p className="mt-3 text-sm text-ink-500">
              A calendar file. Add it twice and you still get one entry, and if the
              group moves the night this one moves with it.
            </p>
          </div>
        </div>

        <p className="mt-8 max-w-xl text-sm text-ink-500">
          Nothing happened? You are in Telegram&rsquo;s own browser, which cannot open a
          calendar file. Tap the three dots at the top, choose{" "}
          <span className="font-medium text-ink-700">Open in Safari</span> — or Chrome —
          and press the button again.
        </p>
      </Section>

      {/* A string prop, so the apostrophe is written literally — an entity here would
          render as "&rsquo;" rather than as a quote mark. */}
      <Section title="While you’re here">
        <p className="text-sm text-ink-700">
          <Link
            href={`/fixtures/${fixture.id}`}
            className="font-medium underline decoration-ink-300 underline-offset-4"
          >
            Who&rsquo;s playing, and the teams once they&rsquo;re picked
          </Link>
        </p>
      </Section>
    </Page>
  );
}

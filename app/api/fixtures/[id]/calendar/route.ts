import { NextResponse } from "next/server";
import { venueOfFixture } from "@/domain/venues";
import { fixtureCalendar } from "@/lib/calendar/ics";
import { fixtureById } from "@/lib/repo/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The fixture as a calendar file.
 *
 * A URL rather than a file pushed into a chat. Everybody can tap a button, including
 * the people who have never opened a private chat with the bot — who are exactly the
 * newcomers most likely to want this — and tapping it twice produces one entry rather
 * than two, because the UID is stable.
 *
 * Deliberately unauthenticated. It gives away the time and the place of a kickabout
 * to anybody holding a fixture id, which is the same thing the public fixtures page
 * already shows, and putting a login in front of a calendar button would mean nobody
 * ever pressed it.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const fixture = await fixtureById(id);

  if (!fixture) {
    return NextResponse.json({ ok: false, error: "no such fixture" }, { status: 404 });
  }

  const ics = fixtureCalendar({
    fixtureId: fixture.id,
    kickoffAt: new Date(fixture.kickoff_at),
    venue: venueOfFixture(fixture),
    updatedAt: new Date(fixture.updated_at),
    cancelled: fixture.status === "cancelled",
  });

  return new Response(ics, {
    headers: {
      // charset matters: a venue name can carry an emoji or an accent, and a client
      // guessing latin-1 would render it as mojibake in somebody's calendar forever.
      "content-type": "text/calendar; charset=utf-8",
      // Named for the day, so a phone's download tray says something useful.
      "content-disposition": `attachment; filename="football-${fixture.kickoff_at.slice(0, 10)}.ics"`,
      // Never cached: the night can move, and a stale file would hand somebody the
      // old kickoff with a sequence number too low to correct it later.
      "cache-control": "no-store",
    },
  });
}

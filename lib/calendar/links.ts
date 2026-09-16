import type { Venue } from "@/domain/venues";

/**
 * The one-tap route into a calendar app.
 *
 * The .ics file beside this is the correct answer and the one that works everywhere,
 * and on a phone it was doing nothing at all: Telegram opens a URL button inside its
 * own browser, and that browser has nowhere to put a downloaded file. The tap ended
 * on a blank screen, which is exactly how a feature gets a reputation for being
 * broken.
 *
 * Google publishes a URL that creates an event from query parameters, so for most of
 * the group there is a route that never touches a file. Apple has no equivalent —
 * there is no URL scheme that creates an event in iOS Calendar — so an iPhone still
 * gets the .ics, which iOS opens straight into Calendar once it is served inline
 * rather than as a download.
 */

export interface CalendarLinkEvent {
  kickoffAt: Date;
  venue: Venue;
  durationMinutes?: number;
  title?: string;
}

const DEFAULT_DURATION_MINUTES = 90;
const DEFAULT_TITLE = "Football";

/** Google's format: UTC, basic ISO 8601, no punctuation. 20260916T160000Z. */
function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * The documented `render?action=TEMPLATE` form, which opens the new-event screen with
 * everything filled in and waits for the person to press save. Deliberately not the
 * version that creates the event outright: a link in a chat that silently writes to
 * somebody's calendar is the sort of thing that gets a bot muted.
 */
export function googleCalendarUrl(event: CalendarLinkEvent): string {
  const duration = event.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const end = new Date(event.kickoffAt.getTime() + duration * 60_000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title ?? DEFAULT_TITLE,
    dates: `${stamp(event.kickoffAt)}/${stamp(end)}`,
    location: event.venue.name,
  });

  // Google's own event page has no field for a map link, so it goes in the notes.
  // Worth carrying: the person reading this later is standing next to a car.
  if (event.venue.mapsUrl) {
    params.set("details", `Directions: ${event.venue.mapsUrl}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

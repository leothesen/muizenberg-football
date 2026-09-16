import { describe, expect, it } from "vitest";
import { ZANDVLEI } from "@/domain/venues";
import { googleCalendarUrl } from "./links";

const KICKOFF = new Date("2026-09-16T15:30:00Z");

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("googleCalendarUrl", () => {
  it("opens the new-event screen rather than writing to the calendar", () => {
    // A link in a group chat that silently adds something to somebody's calendar is
    // how a bot gets muted.
    expect(params(googleCalendarUrl({ kickoffAt: KICKOFF, venue: ZANDVLEI })).get("action")).toBe(
      "TEMPLATE",
    );
  });

  it("gives the start and the end in the format Google parses", () => {
    const dates = params(googleCalendarUrl({ kickoffAt: KICKOFF, venue: ZANDVLEI })).get("dates");

    // Basic ISO 8601 in UTC. Anything with punctuation in it is silently ignored and
    // the event arrives at whatever time the person happens to be looking at.
    expect(dates).toBe("20260916T153000Z/20260916T170000Z");
  });

  it("honours a longer game", () => {
    const dates = params(
      googleCalendarUrl({ kickoffAt: KICKOFF, venue: ZANDVLEI, durationMinutes: 60 }),
    ).get("dates");

    expect(dates).toBe("20260916T153000Z/20260916T163000Z");
  });

  it("carries the venue and the directions", () => {
    const query = params(googleCalendarUrl({ kickoffAt: KICKOFF, venue: ZANDVLEI }));

    expect(query.get("location")).toBe("Zandvlei Sports Ground");
    expect(query.get("details")).toContain(ZANDVLEI.mapsUrl);
  });

  it("leaves out the notes when nobody has pinned the place", () => {
    const query = params(
      googleCalendarUrl({
        kickoffAt: KICKOFF,
        venue: { name: "Dave's field, behind the shop", lat: null, lon: null, mapsUrl: null },
      }),
    );

    expect(query.has("details")).toBe(false);
    // The comma survives, where an unescaped one in the .ics would split the property.
    expect(query.get("location")).toBe("Dave's field, behind the shop");
  });
});

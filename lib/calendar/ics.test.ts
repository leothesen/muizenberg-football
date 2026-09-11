import { describe, expect, it } from "vitest";
import { ZANDVLEI } from "@/domain/venues";
import { fixtureCalendar } from "./ics";

const KICKOFF = new Date("2026-09-16T16:00:00Z");
const UPDATED = new Date("2026-09-14T10:00:00Z");
const FIXTURE_ID = "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e";

function build(overrides: Partial<Parameters<typeof fixtureCalendar>[0]> = {}) {
  return fixtureCalendar({
    fixtureId: FIXTURE_ID,
    kickoffAt: KICKOFF,
    venue: ZANDVLEI,
    updatedAt: UPDATED,
    ...overrides,
  });
}

/** Unfold continuation lines so a test can assert on the logical property. */
function properties(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

describe("fixtureCalendar", () => {
  it("produces a parseable event", () => {
    const props = properties(build());
    expect(props[0]).toBe("BEGIN:VCALENDAR");
    expect(props.at(-1)).toBe("END:VCALENDAR");
    expect(props).toContain("DTSTART:20260916T160000Z");
    expect(props).toContain("DTEND:20260916T173000Z");
  });

  it("uses CRLF, which several clients enforce", () => {
    const ics = build();
    expect(ics).toContain("\r\n");
    expect(ics.split("\r\n").some((l) => l.includes("\n"))).toBe(false);
  });

  it("keeps a stable UID so a changed night revises the entry in place", () => {
    // The match night is now the group's to change. A calendar entry that could not
    // be revised would leave everybody with a stale Wednesday beside the real
    // Thursday, and the app meant to reduce confusion would be manufacturing it.
    const wednesday = build();
    const thursday = build({ kickoffAt: new Date("2026-09-17T15:30:00Z") });

    const uid = (ics: string) => properties(ics).find((l) => l.startsWith("UID:"));
    expect(uid(wednesday)).toBe(uid(thursday));
  });

  it("increases SEQUENCE when the fixture changes", () => {
    // Clients ignore an update whose sequence has not moved.
    const before = properties(build()).find((l) => l.startsWith("SEQUENCE:"))!;
    const after = properties(
      build({ updatedAt: new Date("2026-09-15T10:00:00Z") }),
    ).find((l) => l.startsWith("SEQUENCE:"))!;

    expect(Number(after.split(":")[1])).toBeGreaterThan(Number(before.split(":")[1]));
  });

  it("asks clients to revise rather than publishing a feed", () => {
    // PUBLISH is a feed, and a client reading one has no reason to revise an entry
    // it already holds.
    expect(properties(build())).toContain("METHOD:REQUEST");
  });

  it("carries coordinates so directions work from the calendar entry", () => {
    const props = properties(build());
    expect(props).toContain("GEO:-34.097881;18.4684119");
  });

  it("leaves GEO out for a venue nobody has pinned", () => {
    const props = properties(
      build({ venue: { name: "Some Field", lat: null, lon: null, mapsUrl: null } }),
    );
    expect(props.some((l) => l.startsWith("GEO:"))).toBe(false);
    expect(props).toContain("LOCATION:Some Field");
  });

  it("escapes a venue name that would otherwise split the property", () => {
    // "Dave's field, behind the shop" contains a comma, which is a value separator
    // in RFC 5545 — unescaped it silently becomes two properties and the entry loses
    // its location.
    const props = properties(
      build({
        venue: {
          name: "Dave's field, behind the shop; gate 2",
          lat: null,
          lon: null,
          mapsUrl: null,
        },
      }),
    );

    expect(props).toContain("LOCATION:Dave's field\\, behind the shop\\; gate 2");
  });

  it("folds a long line to 75 octets", () => {
    // Strict parsers reject an over-long line outright; lenient ones truncate it,
    // which would drop the end of a URL with no error anywhere.
    const long = "A".repeat(200);
    const ics = build({
      venue: { name: long, lat: null, lon: null, mapsUrl: null },
    });

    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length, line).toBeLessThanOrEqual(75);
    }
  });

  it("never splits a multi-byte character when folding", () => {
    // An emoji is four octets. A fold that counted characters would produce an
    // over-long line; one that cut blindly at 75 bytes would produce mojibake.
    const ics = build({
      venue: { name: "⚽".repeat(60), lat: null, lon: null, mapsUrl: null },
    });

    expect(ics).not.toContain("�");
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // And it still says what it should once unfolded.
    expect(properties(ics).find((l) => l.startsWith("LOCATION:"))).toContain("⚽".repeat(60));
  });

  it("marks an abandoned game cancelled rather than deleting it", () => {
    // Somebody who saved the entry should see it turn off in their calendar, not
    // quietly stay in it.
    const props = properties(build({ cancelled: true }));
    expect(props).toContain("STATUS:CANCELLED");
  });
});

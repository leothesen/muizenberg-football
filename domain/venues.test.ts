import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VENUE,
  ZANDVLEI,
  coordinatesFromMapsUrl,
  isMapsLink,
  isShortMapsLink,
  nameFromMapsUrl,
  parseVenue,
  resolveShortMapsLink,
  venueFor,
  venueOfFixture,
} from "./venues";

/** The link Leo actually pasted, once Google's shortener has been followed. */
const REAL_RESOLVED =
  "https://www.google.com/maps/place/Zandvlei+Sports+Ground/@-34.097881,18.465837,17z/data=!3m1!4b1!4m6!3m5!1s0x1dcc41abf52b1f45:0xff029c8e2f2e54e2!8m2!3d-34.097881!4d18.4684119!16s%2Fg%2F11tc9xf6y4";

describe("ZANDVLEI", () => {
  it("points at the pitch, not the suburb", () => {
    // A transposed pair or a dropped minus sign would put the league in Egypt with
    // nothing else noticing.
    expect(ZANDVLEI.lat).toBeCloseTo(-34.0979, 3);
    expect(ZANDVLEI.lon).toBeCloseTo(18.4684, 3);
    expect(DEFAULT_VENUE).toBe(ZANDVLEI);
  });

  it("uses a durable map link, not a share link", () => {
    expect(ZANDVLEI.mapsUrl).toContain("api=1");
    // goo.gl links expire and carry a tracking payload; nobody reviewing a diff can
    // tell where one points.
    expect(ZANDVLEI.mapsUrl).not.toContain("goo.gl");
  });
});

describe("venueFor", () => {
  it("is not fussy about case or stray whitespace", () => {
    // The name arrives from a text column a human may well have typed. Losing the pin
    // over a capital letter would send somebody to the wrong end of the vlei.
    expect(venueFor("  zandvlei sports ground ")).toBe(ZANDVLEI);
  });

  it("returns null for a ground nobody has described", () => {
    expect(venueFor("Some Other Field")).toBeNull();
    expect(venueFor(null)).toBeNull();
  });
});

describe("coordinatesFromMapsUrl", () => {
  it("prefers the place over the camera", () => {
    // !3d/!4d is the pitch; @lat,lon is wherever the map happened to be centred. On
    // this very link they differ by about 250 m, which is the distance between the
    // goalposts and the car park.
    expect(coordinatesFromMapsUrl(REAL_RESOLVED)).toEqual({
      lat: -34.097881,
      lon: 18.4684119,
    });
  });

  it("reads the documented api=1 form", () => {
    expect(
      coordinatesFromMapsUrl(
        "https://www.google.com/maps/search/?api=1&query=-34.1%2C18.47",
      ),
    ).toEqual({ lat: -34.1, lon: 18.47 });
  });

  it("falls back to the camera when there is nothing better", () => {
    expect(
      coordinatesFromMapsUrl("https://www.google.com/maps/@-33.9,18.4,15z"),
    ).toEqual({ lat: -33.9, lon: 18.4 });
  });

  it("refuses impossible coordinates rather than storing them", () => {
    expect(
      coordinatesFromMapsUrl("https://www.google.com/maps/search/?api=1&query=200,900"),
    ).toBeNull();
    expect(coordinatesFromMapsUrl("not a url")).toBeNull();
  });
});

describe("nameFromMapsUrl", () => {
  it("reads the place name out of the path", () => {
    expect(nameFromMapsUrl(REAL_RESOLVED)).toBe("Zandvlei Sports Ground");
  });

  it("says nothing when the place is just a dropped pin", () => {
    // Google labels an unnamed pin with its own coordinates, which is a worse label
    // than none — the caller has a better fallback.
    expect(
      nameFromMapsUrl("https://www.google.com/maps/place/-34.1,18.4/data=!3m1"),
    ).toBeNull();
  });
});

describe("isMapsLink", () => {
  it("accepts the hosts Google actually uses", () => {
    expect(isMapsLink("https://maps.app.goo.gl/PHxfYophiH1wpKMu5")).toBe(true);
    expect(isMapsLink(REAL_RESOLVED)).toBe(true);
  });

  it("rejects everything else, because this list gates a server-side fetch", () => {
    // parseVenue hands the URL to resolveShortMapsLink, which fetches it. Anyone in
    // the group chat can type a link, so the allowlist is the whole defence.
    expect(isMapsLink("https://evil.example.com/maps/place/x")).toBe(false);
    expect(isMapsLink("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isMapsLink("Zandvlei")).toBe(false);
  });

  it("knows which links cannot be read without the network", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/PHxfYophiH1wpKMu5")).toBe(true);
    expect(isShortMapsLink(REAL_RESOLVED)).toBe(false);
  });
});

describe("parseVenue", () => {
  it("takes a plain name", () => {
    expect(parseVenue("Sea Point Prom")).toEqual({
      name: "Sea Point Prom",
      lat: null,
      lon: null,
      mapsUrl: null,
    });
  });

  it("recognises the league's own pitch by name and reuses its pin", () => {
    expect(parseVenue("Zandvlei Sports Ground")).toBe(ZANDVLEI);
  });

  it("reads a full maps link", () => {
    expect(parseVenue(REAL_RESOLVED)).toMatchObject({
      name: "Zandvlei Sports Ground",
      lat: -34.097881,
      lon: 18.4684119,
    });
  });

  it("keeps a short link tappable even before it is resolved", () => {
    // The share button on a phone produces exactly this, so it has to do something
    // useful immediately rather than waiting on a fetch that may fail.
    const parsed = parseVenue("https://maps.app.goo.gl/PHxfYophiH1wpKMu5");
    expect(parsed?.lat).toBeNull();
    expect(parsed?.mapsUrl).toBe("https://maps.app.goo.gl/PHxfYophiH1wpKMu5");
  });

  it("lets somebody name the place and paste the link together", () => {
    const parsed = parseVenue(`The big pitch ${REAL_RESOLVED}`);
    expect(parsed?.name).toBe("The big pitch");
    expect(parsed?.lat).toBeCloseTo(-34.097881, 5);
  });

  it("takes a bare pair of coordinates", () => {
    expect(parseVenue("-34.1, 18.47")).toMatchObject({ lat: -34.1, lon: 18.47 });
  });

  it("treats a name containing numbers as a name, not a coordinate", () => {
    // "Field 2, Grassy Park" has a comma and a digit and is obviously not a point.
    expect(parseVenue("Field 2, Grassy Park")).toMatchObject({
      name: "Field 2, Grassy Park",
      lat: null,
    });
  });

  it("ignores a link that is not a map", () => {
    // Somebody pasting a news article should get a venue named after what they typed,
    // not a fetch against an arbitrary host.
    const parsed = parseVenue("The usual place https://example.com/whatever");
    expect(parsed?.name).toBe("The usual place");
    expect(parsed?.mapsUrl).toBeNull();
  });

  it("returns null only for an empty line", () => {
    expect(parseVenue("   ")).toBeNull();
  });
});

describe("resolveShortMapsLink", () => {
  it("follows a share link and keeps the place, not the camera", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ url: REAL_RESOLVED });
    const parsed = parseVenue("https://maps.app.goo.gl/PHxfYophiH1wpKMu5")!;
    const resolved = await resolveShortMapsLink(parsed, fetchImpl as never);

    expect(resolved.lat).toBeCloseTo(-34.097881, 5);
    expect(resolved.name).toBe("Zandvlei Sports Ground");
    expect(resolved.mapsUrl).toContain("api=1");
  });

  it("keeps a name the sender typed rather than overwriting it with Google's", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ url: REAL_RESOLVED });
    const parsed = parseVenue("Behind the clubhouse https://maps.app.goo.gl/x")!;
    const resolved = await resolveShortMapsLink(parsed, fetchImpl as never);

    expect(resolved.name).toBe("Behind the clubhouse");
    expect(resolved.lat).toBeCloseTo(-34.097881, 5);
  });

  it("refuses a redirect that leaves Google", async () => {
    // An open redirect on a maps host would otherwise turn this into a fetch of
    // anywhere the sender likes.
    const fetchImpl = vi.fn().mockResolvedValue({ url: "https://evil.example.com/x" });
    const parsed = parseVenue("https://maps.app.goo.gl/x")!;
    const resolved = await resolveShortMapsLink(parsed, fetchImpl as never);

    expect(resolved.lat).toBeNull();
    expect(resolved.mapsUrl).toBe("https://maps.app.goo.gl/x");
  });

  it("survives the network being down", async () => {
    // Telling the group where the game is must not depend on Google answering.
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const parsed = parseVenue("https://maps.app.goo.gl/x")!;
    const resolved = await resolveShortMapsLink(parsed, fetchImpl as never);

    expect(resolved.name).toBe("Wherever this points");
    expect(resolved.lat).toBeNull();
  });

  it("does not fetch a link that already has coordinates", async () => {
    const fetchImpl = vi.fn();
    await resolveShortMapsLink(parseVenue(REAL_RESOLVED)!, fetchImpl as never);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("venueOfFixture", () => {
  it("falls back to the name lookup when the row carries no point", () => {
    // The ordinary case: hundreds of fixtures at Zandvlei, none of them storing a
    // copy of its latitude, so moving the pin fixes all of them at once.
    expect(venueOfFixture({ venue: "Zandvlei Sports Ground" })).toBe(ZANDVLEI);
  });

  it("prefers what was recorded on the night", () => {
    expect(
      venueOfFixture({
        venue: "Sea Point Prom",
        venue_lat: "-33.915000",
        venue_lon: "18.390000",
      }),
    ).toMatchObject({ name: "Sea Point Prom", lat: -33.915, lon: 18.39 });
  });

  it("reads numeric columns that arrive as strings", () => {
    // node-postgres returns numeric as a string. A typeof check would silently drop
    // every stored coordinate and every map button would quietly vanish.
    const venue = venueOfFixture({ venue: "X", venue_lat: "-34.1", venue_lon: "18.4" });
    expect(venue.lat).toBe(-34.1);
  });

  it("announces a nameless fixture as the usual pitch", () => {
    expect(venueOfFixture({ venue: null }).name).toBe(ZANDVLEI.name);
  });

  it("keeps a venue nobody pinned", () => {
    expect(venueOfFixture({ venue: "Some Field" })).toEqual({
      name: "Some Field",
      lat: null,
      lon: null,
      mapsUrl: null,
    });
  });
});

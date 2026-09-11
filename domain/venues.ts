/**
 * Where the football actually is.
 *
 * Two facts shape this module. Most weeks the answer is Zandvlei and nobody should
 * have to say so. Occasionally it is somewhere else — a different pitch, a beach, a
 * field somebody's mate has keys to — and the person who knows that is a player with
 * a phone, not an administrator with a form.
 *
 * So a venue is a name, optionally with a point on the earth. The name is what the
 * chat message says. The coordinates are what make the map button and the calendar
 * invite's GEO line work, and they are optional throughout: a game at a place nobody
 * has pinned is still a game, it just loses the pin.
 *
 * What a human types is the input. On a phone the share sheet in Google Maps produces
 * a maps.app.goo.gl link, so that shape has to work — it is the realistic thing
 * somebody will paste, and refusing it would push them back to typing a name.
 */

export interface Venue {
  /** What the chat message says, and what the fixture stores. */
  name: string;
  lat: number | null;
  lon: number | null;
  /** Opens the Maps app on a phone and google.com everywhere else. */
  mapsUrl: string | null;
}

/** The pitch the league plays on unless somebody says otherwise. */
export const ZANDVLEI: Venue = {
  name: "Zandvlei Sports Ground",
  lat: -34.097881,
  lon: 18.4684119,
  mapsUrl: mapsLink(-34.097881, 18.4684119),
};

export const DEFAULT_VENUE = ZANDVLEI;

/**
 * The most Zandvlei takes a side.
 *
 * Advisory only: a fixture keeps its own players_per_team once created, because the
 * size of a game that already happened must not change when somebody edits a default.
 * A full-size ground is available if the turnout ever justifies it, and is
 * deliberately not encoded until somebody has actually stood on it.
 */
export const DEFAULT_PLAYERS_PER_TEAM = 9;

/**
 * The documented api=1 form rather than a shortened share link: share links carry a
 * tracking payload, expire at Google's discretion, and cannot be read by a human
 * reviewing a diff. Coordinates land on the pitch instead of the car park.
 */
export function mapsLink(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}`;
}

const KNOWN = new Map<string, Venue>([[ZANDVLEI.name.toLowerCase(), ZANDVLEI]]);

/** A venue the league already knows the coordinates of, by its stored name. */
export function venueFor(name: string | null | undefined): Venue | null {
  if (!name) return null;
  return KNOWN.get(name.trim().toLowerCase()) ?? null;
}

/**
 * The venue of a fixture, preferring what was recorded on the night.
 *
 * A fixture carries its own coordinates when somebody set an unusual venue, and
 * nothing else when it is the usual one. Falling back to the name lookup means the
 * hundreds of ordinary fixtures do not each store a copy of Zandvlei's latitude, and
 * moving the pin later fixes all of them at once.
 */
export function venueOfFixture(row: {
  venue: string | null;
  venue_lat?: string | number | null;
  venue_lon?: string | number | null;
  venue_url?: string | null;
}): Venue {
  const name = row.venue?.trim() || DEFAULT_VENUE.name;
  const lat = toNumber(row.venue_lat);
  const lon = toNumber(row.venue_lon);

  if (lat !== null && lon !== null) {
    return { name, lat, lon, mapsUrl: row.venue_url ?? mapsLink(lat, lon) };
  }

  const known = venueFor(name);
  if (known) return known;

  // A name somebody typed with no pin attached. Still announceable.
  return { name, lat: null, lon: null, mapsUrl: row.venue_url ?? null };
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  // Postgres numeric comes back as a string through node-postgres, so a plain
  // typeof check would silently drop every stored coordinate.
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------------------------- */
/* Reading what a human typed                                                  */
/* -------------------------------------------------------------------------- */

/** Hosts a maps link may live on. Anything else is treated as plain text. */
const MAPS_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "www.google.com",
  "google.com",
  "maps.google.co.za",
]);

const URL_PATTERN = /https?:\/\/\S+/gi;

export function isMapsLink(value: string): boolean {
  try {
    return MAPS_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * A share link that has to be followed before it says anything.
 *
 * maps.app.goo.gl carries no coordinates at all — it is an opaque id that only
 * resolves over the network. It is also exactly what the Google Maps share button
 * produces on a phone, so it is the most likely thing to arrive.
 */
export function isShortMapsLink(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "maps.app.goo.gl" || host === "goo.gl";
  } catch {
    return false;
  }
}

function validCoordinates(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

function coordinatesFromPair(value: string): { lat: number; lon: number } | null {
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return validCoordinates(lat, lon) ? { lat, lon } : null;
}

/**
 * Coordinates out of a resolved Google Maps URL.
 *
 * `!3d<lat>!4d<lon>` inside the data segment is the *place*; `@lat,lon,zoom` is where
 * the camera happened to be sitting. They differ by a couple of hundred metres on the
 * link Leo sent, which is the difference between the pitch and the car park — so the
 * place wins and the camera is only a fallback.
 */
export function coordinatesFromMapsUrl(
  value: string,
): { lat: number; lon: number } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const place = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (place) {
    const lat = Number(place[1]);
    const lon = Number(place[2]);
    if (validCoordinates(lat, lon)) return { lat, lon };
  }

  for (const key of ["query", "q", "ll", "center", "daddr"]) {
    const param = url.searchParams.get(key);
    if (param) {
      const pair = coordinatesFromPair(param);
      if (pair) return pair;
    }
  }

  const camera = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (camera) {
    const lat = Number(camera[1]);
    const lon = Number(camera[2]);
    if (validCoordinates(lat, lon)) return { lat, lon };
  }

  return null;
}

/** The place name Google put in the path, if there is one. */
export function nameFromMapsUrl(value: string): string | null {
  const match = value.match(/\/maps\/place\/([^/@?]+)/);
  if (!match?.[1]) return null;

  try {
    const decoded = decodeURIComponent(match[1]).replace(/\+/g, " ").trim();
    // A place with no name of its own comes back as the coordinates again, which is
    // a worse label than saying nothing and letting the caller fall back.
    return decoded && !coordinatesFromPair(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Turn a line somebody typed into a venue.
 *
 * Handles "Sea Point Prom", a bare maps link, a pair of coordinates, and a name with
 * a link after it — because all four are things a person reasonably sends when asked
 * where the game is. Returns null only for an empty line.
 *
 * A short share link cannot be read without the network, so it comes back with the
 * link and no coordinates; `resolveShortMapsLink` upgrades it when a fetch is
 * available. That split keeps this function pure and testable.
 */
export function parseVenue(input: string): Venue | null {
  const raw = input.trim();
  if (!raw) return null;

  const urls = raw.match(URL_PATTERN)?.filter(isMapsLink) ?? [];
  const link = urls[0] ?? null;

  // Whatever is left once the links are removed is what the person called the place.
  const typedName = raw.replace(URL_PATTERN, " ").replace(/\s+/g, " ").trim();

  if (link) {
    const point = coordinatesFromMapsUrl(link);
    const name = typedName || nameFromMapsUrl(link) || "Wherever this points";

    if (point) {
      return { name, lat: point.lat, lon: point.lon, mapsUrl: mapsLink(point.lat, point.lon) };
    }

    // Short link, or one Google has stopped putting coordinates in. Keep the link:
    // tapping it still works even though we cannot put a pin in a calendar entry.
    return { name, lat: null, lon: null, mapsUrl: link };
  }

  const bare = coordinatesFromPair(raw);
  if (bare && !/[a-z]/i.test(raw)) {
    return {
      name: `${bare.lat}, ${bare.lon}`,
      lat: bare.lat,
      lon: bare.lon,
      mapsUrl: mapsLink(bare.lat, bare.lon),
    };
  }

  if (!typedName) return null;

  // Somebody named a place the league already knows. Reuse its pin rather than
  // recording a nameless duplicate.
  return venueFor(typedName) ?? { name: typedName, lat: null, lon: null, mapsUrl: null };
}

/**
 * Follow a share link far enough to read the coordinates out of it.
 *
 * Only ever called for hosts in MAPS_HOSTS, and the redirect target is checked to be
 * one too: this runs on a server, and a function that fetches an arbitrary URL on
 * behalf of whoever typed it in a group chat is a hole, not a feature.
 */
export async function resolveShortMapsLink(
  venue: Venue,
  fetchImpl: typeof fetch = fetch,
): Promise<Venue> {
  if (venue.lat !== null || !venue.mapsUrl || !isShortMapsLink(venue.mapsUrl)) {
    return venue;
  }

  try {
    const response = await fetchImpl(venue.mapsUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });

    const resolved = response.url;
    if (!resolved || !isMapsLink(resolved)) return venue;

    const point = coordinatesFromMapsUrl(resolved);
    if (!point) return venue;

    return {
      // A link pasted with no words around it gets Google's name for the place, now
      // that we can finally see it.
      name:
        venue.name === "Wherever this points"
          ? (nameFromMapsUrl(resolved) ?? venue.name)
          : venue.name,
      lat: point.lat,
      lon: point.lon,
      mapsUrl: mapsLink(point.lat, point.lon),
    };
  } catch {
    // Network trouble must not stop somebody telling the group where the game is.
    return venue;
  }
}

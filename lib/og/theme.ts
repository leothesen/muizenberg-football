/**
 * The look of the rendered cards.
 *
 * Hex literals rather than Tailwind classes: these images are rendered by Satori,
 * which understands inline styles and nothing else. The values are the same beach-hut
 * palette as `tailwind.config.ts`, and a test keeps the two from drifting apart.
 *
 * Sand, not floodlight. The cards used to be drawn on near-black, where flat bright
 * paint glows and the warm half of the palette collapses into one smear. They are
 * drawn on pale sand now, which is where the huts actually stand and where seven
 * colours can be told apart at a glance on a phone.
 */

export const PALETTE = {
  sand50: "#FAF7F1",
  sand100: "#F1ECE1",
  sand200: "#E3DCCC",
  sand300: "#C9C0AC",
  ink900: "#0F1E19",
  ink800: "#1B2E28",
  ink700: "#2E443C",
  ink500: "#5D6F67",
  ink400: "#83938B",
  hutRed: "#E4572E",
  hutOrange: "#F08A24",
  hutYellow: "#F4B942",
  hutGreen: "#2CB67D",
  hutBlue: "#17A2CC",
  hutIndigo: "#4C6EF5",
  hutPink: "#E56399",
} as const;

/** Secondary text. Dark enough to read on sand in sunlight, quiet enough to recede. */
export const MUTED = PALETTE.ink500;

/**
 * Team colour tokens, as stored on `fixture_teams.colour`.
 *
 * These are swatch fills, and the team's *name* is always ink beside one — which is
 * what lets `kit-white` be white. On the old near-black ground a white swatch was the
 * only legible option and a black one was invisible, so `kit-black` had to be faked
 * as a mid grey. On sand both kits can simply be their own colour, with a hairline
 * around the white one so it reads as a swatch rather than a hole in the page.
 *
 * The `hut-*` tokens are kept because older fixtures are stored with them.
 */
export const TEAM_COLOURS: Record<string, string> = {
  "kit-black": PALETTE.ink800,
  "kit-white": PALETTE.sand50,
  "hut-yellow": PALETTE.hutYellow,
  "hut-blue": PALETTE.hutBlue,
  "hut-red": PALETTE.hutRed,
  "hut-green": PALETTE.hutGreen,
  "hut-orange": PALETTE.hutOrange,
  "hut-indigo": PALETTE.hutIndigo,
  "hut-pink": PALETTE.hutPink,
};

export function teamColour(token: string): string {
  return TEAM_COLOURS[token] ?? PALETTE.hutGreen;
}

/**
 * The huts, in the order they stand on the beach.
 *
 * This array is the row itself, and it runs along the top of every picture the bot
 * sends and every page of the website.
 */
export const HUT_ORDER: readonly string[] = [
  PALETTE.hutRed,
  PALETTE.hutOrange,
  PALETTE.hutYellow,
  PALETTE.hutGreen,
  PALETTE.hutBlue,
  PALETTE.hutIndigo,
  PALETTE.hutPink,
];

/**
 * The hut a particular person gets, and keeps.
 *
 * Stable for the life of a name, so somebody's card, their row in the table and their
 * name on the team sheet are all the same colour — a person becomes a hut rather than
 * a number. Hashed rather than assigned, because assigning would need a column and a
 * migration to express something nobody has to agree on.
 *
 * FNV-1a: short, no dependency, and spreads adjacent names across different colours
 * instead of handing consecutive players the same one.
 */
export function hutFor(seed: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return HUT_ORDER[(hash >>> 0) % HUT_ORDER.length]!;
}

/**
 * The colour a rating is printed *behind*.
 *
 * Bands rather than a gradient, because a card is read at a glance on a phone and a
 * continuous ramp would make 71 and 74 indistinguishable. It is a fill, never a text
 * colour — yellow lettering on pale sand cannot be read at all.
 */
export function ratingColour(rating: number): string {
  if (rating >= 85) return PALETTE.hutYellow;
  if (rating >= 75) return PALETTE.hutGreen;
  if (rating >= 65) return PALETTE.hutBlue;
  if (rating >= 55) return PALETTE.hutOrange;
  return PALETTE.hutRed;
}

/** Same bands, named, for the small label under a rating. */
export function ratingBand(rating: number): string {
  if (rating >= 85) return "Elite";
  if (rating >= 75) return "Quality";
  if (rating >= 65) return "Solid";
  if (rating >= 55) return "Getting there";
  return "Enthusiastic";
}

export const FORM_COLOURS = {
  W: PALETTE.hutGreen,
  D: PALETTE.sand300,
  L: PALETTE.hutRed,
} as const;

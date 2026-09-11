/**
 * The look of the rendered cards.
 *
 * Hex literals rather than Tailwind classes: these images are rendered by Satori,
 * which understands inline styles and nothing else. The values are the same beach-hut
 * palette as `tailwind.config.ts`, and a test keeps the two from drifting apart.
 */

export const PALETTE = {
  pitch900: "#07110D",
  pitch800: "#0B1A14",
  pitch700: "#10261D",
  pitch600: "#163527",
  pitch500: "#1B4332",
  hutRed: "#E4572E",
  hutOrange: "#F08A24",
  hutYellow: "#F4B942",
  hutGreen: "#2CB67D",
  hutBlue: "#17A2CC",
  hutIndigo: "#4C6EF5",
  hutPink: "#E56399",
  sand: "#F5EFE6",
  chalk: "#FDFCF8",
} as const;

/** Muted text: the sand colour at reduced weight, pre-blended so Satori need not. */
export const MUTED = "#9DAFA4";

/**
 * Team colour tokens, as stored on `fixture_teams.colour`.
 *
 * `kit-black` is not `#000000`, and cannot be. These images are drawn on `pitch900`,
 * which is very nearly black itself, and the token is used as the colour of the team's
 * *name* as well as its swatch — so a literal black would render an invisible heading
 * on an invisible dot. It is the lightest thing that still reads as the dark kit
 * rather than as the light one, which is the only job it has: telling the two sides
 * apart at a glance on a phone.
 *
 * The `hut-*` tokens are kept because older fixtures are stored with them.
 */
export const TEAM_COLOURS: Record<string, string> = {
  "kit-black": "#77867E",
  "kit-white": PALETTE.chalk,
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
 * The colour a rating is printed in.
 *
 * Bands rather than a gradient, because a card is read at a glance on a phone and a
 * continuous ramp would make 71 and 74 indistinguishable.
 */
/**
 * The huts, in the order they stand on the beach.
 *
 * The palette has been named after Muizenberg's bathing boxes since the first
 * commit, and until now that was the only place the huts appeared — every rendered
 * card came out dark green with a single accent, which is a perfectly good app and
 * not this beach. This array is the row itself, and it runs along the top of every
 * picture the bot sends.
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
 * Stable for the life of an id, so somebody's card, their row in the table and their
 * name on the team sheet are all the same colour — a person becomes a hut rather than
 * a number. Hashed rather than assigned, because assigning would need a column and a
 * migration to express something nobody has to agree on.
 *
 * FNV-1a: short, no dependency, and spreads adjacent ids across different colours
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
  D: MUTED,
  L: PALETTE.hutRed,
} as const;

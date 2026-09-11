import { HUT_ORDER, PALETTE, hutFor } from "@/lib/og/theme";

/**
 * The bathing boxes, on the website.
 *
 * The rendered cards grew a hut stripe first, because that is what people actually
 * look at — a picture in a chat. This is the same device on the web, so that tapping
 * a card through to the site lands somewhere that looks like where you came from. The
 * colours, the order and the hash are all imported from the image theme rather than
 * re-typed: one row of huts, two surfaces.
 *
 * `lib/og/theme.ts` is plain constants with no Satori in it, so importing it here
 * costs nothing and guarantees the two can never drift.
 */

/**
 * One hut: pitched roof, plank body, a door.
 *
 * Drawn rather than a coloured square, because a square is a legend entry and a hut
 * is the thing itself. It is small — 14px beside a name — so it is three shapes and
 * no more; anything finer turns to mud at the size it actually gets used.
 */
function HutShape({ colour, size }: { colour: string; size: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className="shrink-0"
    >
      <path d="M8 1 15.2 7H0.8Z" fill={colour} />
      <rect x="2.4" y="7" width="11.2" height="8" fill={colour} />
      {/* The door, punched back to the page ground rather than painted on. */}
      <rect
        x="6.3"
        y="10"
        width="3.4"
        height="5"
        fill={PALETTE.pitch900}
        opacity="0.5"
      />
    </svg>
  );
}

/** The row itself, as a band. Same seven colours, same order, as every image. */
export function HutStripe({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`flex h-1.5 w-full ${className}`}>
      {HUT_ORDER.map((colour) => (
        // Equal shares rather than fixed widths, so the row spans a phone and a
        // desktop without anybody doing arithmetic.
        <div
          key={colour}
          className="flex-1"
          style={{ backgroundColor: colour }}
        />
      ))}
    </div>
  );
}

/**
 * The hut belonging to one person, hashed off a stable seed.
 *
 * Their card, their row in the table and their name on the team sheet all come out
 * the same colour, so a person reads as a hut rather than as a position.
 */
export function Hut({
  seed,
  size = 14,
  className = "",
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex ${className}`}>
      <HutShape colour={hutFor(seed)} size={size} />
    </span>
  );
}

/**
 * A short row of huts, where a logo would go.
 *
 * There is no club name yet, so there is nothing to set in a typeface. Five huts say
 * where this is without naming it, and leave a space to the right for the day a name
 * turns up.
 */
export function HutRow({
  count = 5,
  size = 18,
}: {
  count?: number;
  size?: number;
}) {
  return (
    <span aria-hidden className="flex items-end gap-[3px]">
      {HUT_ORDER.slice(0, count).map((colour) => (
        <HutShape key={colour} colour={colour} size={size} />
      ))}
    </span>
  );
}

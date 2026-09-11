import type { ReactElement } from "react";
import { HUT_ORDER } from "./theme";

/**
 * The row of bathing boxes, as a strip.
 *
 * Muizenberg's beach huts are the one thing everybody pictures when you say the name,
 * and the palette has been named after them since the first commit without a single
 * picture ever showing one. This is the signature that ties the cards, the table, the
 * team sheet and the match report together: the same seven colours, the same order,
 * along the top of each.
 *
 * Deliberately a band of flat colour rather than drawn huts. These images are
 * rendered by Satori at whatever size the content needs, they are looked at on a
 * phone for about four seconds, and an illustration would be both expensive and
 * ignored. A stripe reads instantly and cannot clip.
 */
/**
 * A single drawn hut, for images.
 *
 * The same three shapes as the website's, so a person's mark is literally the same
 * picture in a chat and in a table. A plain coloured square was tried first and read
 * as a rendering artefact sitting next to the name rather than as anybody's identity.
 */
export function HutMark({ colour, size }: { colour: string; size: number }): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size}>
      <path d="M8 1 15.2 7H0.8Z" fill={colour} />
      <rect x="2.4" y="7" width="11.2" height="8" fill={colour} />
      <rect x="6.3" y="10" width="3.4" height="5" fill="#0F1E19" opacity="0.45" />
    </svg>
  );
}

export function HutStripe({
  height = 8,
  radius = 0,
}: {
  height?: number;
  /** Rounds the outer ends, for a strip that sits inside a rounded frame. */
  radius?: number;
}): ReactElement {
  return (
    <div style={{ display: "flex", width: "100%", height }}>
      {HUT_ORDER.map((colour, index) => (
        <div
          key={colour}
          style={{
            display: "flex",
            // Equal shares rather than a fixed width: the strip has to span images
            // from 720 to 1000 wide without anybody working out the arithmetic.
            flexGrow: 1,
            height,
            background: colour,
            borderTopLeftRadius: index === 0 ? radius : 0,
            borderBottomLeftRadius: index === 0 ? radius : 0,
            borderTopRightRadius: index === HUT_ORDER.length - 1 ? radius : 0,
            borderBottomRightRadius: index === HUT_ORDER.length - 1 ? radius : 0,
          }}
        />
      ))}
    </div>
  );
}

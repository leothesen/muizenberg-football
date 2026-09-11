import { ImageResponse } from "next/og";
import { HUT_ORDER, PALETTE } from "@/lib/og/theme";

export const runtime = "nodejs";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * The favicon: three bathing boxes in a row.
 *
 * Drawn rather than lettered, because two initials at 16px is what every other tab in
 * the browser looks like, and there is no club name to abbreviate in any case.
 *
 * Three rather than the full seven, and drawn taller than they are wide. Seven roofs
 * at this size turn to mud, and a square hut leaves the icon two-thirds empty sand —
 * a real bathing box is a tall narrow box anyway, so the proportion that fills the
 * square is also the more accurate one.
 *
 * Rendered at 64 so it downsamples cleanly to the 16 and 32 a browser asks for. No
 * font is loaded: there is no text here, and reading three typefaces to draw three
 * rectangles would put a disk read in front of every favicon request.
 */
export default function Icon() {
  const huts = [HUT_ORDER[0]!, HUT_ORDER[2]!, HUT_ORDER[4]!];

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          width: "100%",
          height: "100%",
          background: PALETTE.sand50,
        }}
      >
        {huts.map((colour) => (
          <svg key={colour} viewBox="0 0 16 32" width={18} height={36}>
            <path d="M8 1 15.5 12H0.5Z" fill={colour} />
            <rect x="2" y="12" width="12" height="19" fill={colour} />
            <rect x="6" y="20" width="4" height="11" fill={PALETTE.ink900} opacity="0.45" />
          </svg>
        ))}
      </div>
    ),
    size,
  );
}

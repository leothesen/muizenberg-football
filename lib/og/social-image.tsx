import type { ReactElement } from "react";
import type { ImageSize } from "./layout";
import { MUTED, PALETTE, HUT_ORDER } from "./theme";
import { HutStripe } from "./huts";

/**
 * The picture that appears when somebody pastes the league's link into a chat.
 *
 * This is not decoration: the whole plan for moving thirty-eight people off WhatsApp
 * is Leo posting a link there. Without an image the preview is two lines of grey text
 * next to a blank square, which is what a dead link looks like. With one it is the
 * beach, and the huts do the explaining before anybody reads a word.
 *
 * Drawn at the size link previews are actually cropped to, and the headline stays in
 * the top-left because that is the part that survives every crop.
 */

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 72;

export function socialImageSize(): ImageSize {
  return { width: WIDTH, height: HEIGHT };
}

/** A bathing box, drawn big enough to be a picture rather than a marker. */
function Hut({ colour, width }: { colour: string; width: number }): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={width} height={width}>
      <path d="M8 1 15.2 7H0.8Z" fill={colour} />
      <rect x="2.4" y="7" width="11.2" height="8" fill={colour} />
      <rect x="6.3" y="10" width="3.4" height="5" fill={PALETTE.ink900} opacity="0.45" />
    </svg>
  );
}

export function SocialImage({ seasonName }: { seasonName: string }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: PALETTE.sand50,
        color: PALETTE.ink900,
        fontFamily: "Archivo",
      }}
    >
      <HutStripe height={16} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          paddingLeft: PAD,
          paddingRight: PAD,
          paddingTop: 64,
          // The huts need sand to stand on. Flush to the edge they are cut off at the
          // ankles, which reads as a rendering mistake rather than as a beach.
          paddingBottom: 52,
        }}
      >
        {seasonName ? (
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 4,
              color: MUTED,
              marginBottom: 18,
            }}
          >
            {seasonName.toUpperCase()}
          </div>
        ) : null}

        <div style={{ display: "flex", fontSize: 128, fontWeight: 800, letterSpacing: -4 }}>
          The league
        </div>

        <div style={{ display: "flex", fontSize: 34, color: PALETTE.ink700, marginTop: 26 }}>
          Squads, goals, nutmegs and bragging rights.
        </div>
        <div style={{ display: "flex", fontSize: 34, color: PALETTE.ink700, marginTop: 6 }}>
          Run entirely from the group chat.
        </div>

        <div style={{ display: "flex", flexGrow: 1 }} />

        {/* The row itself, standing on the sand along the bottom edge. */}
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          {HUT_ORDER.map((colour) => (
            <div key={colour} style={{ display: "flex", marginRight: 18 }}>
              <Hut colour={colour} width={118} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import type { ReactElement } from "react";
import { fit, listHeight, type ImageSize } from "./layout";
import { MUTED, PALETTE, hutFor, teamColour } from "./theme";
import { HutMark, HutStripe } from "./huts";

/**
 * The team sheet.
 *
 * Two columns facing each other, because that is how people read a team sheet and
 * because the thing everybody checks first is which side they are on. Each name
 * carries its owner's hut, so finding yourself is a matter of spotting your colour
 * rather than reading eleven names.
 */

/**
 * The fixed vertical cost of everything that is not a player row: outer padding, the
 * title and subtitle, the rule under them, and each column's team heading.
 *
 * These are measured from the rendered image, not guessed. Satori clips silently, so
 * an underestimate here does not error — it just quietly removes the bottom of the
 * picture, which is how the first version shipped.
 */
const HEADER = 250;
const ROW = 56;
// Was 104, when a balance note sat under the two sides. That line said things like
// "Dead even on paper. No excuses." and was cut: it is commentary on a number nobody
// asked to see, on the one message people open to find their own name.
const FOOTER = 56;
const WIDTH = 1000;

export interface TeamSheetSide {
  name: string;
  colour: string;
  starters: { displayName: string; emoji: string }[];
  subs: { displayName: string; emoji: string }[];
}

export interface TeamSheetImageProps {
  a: TeamSheetSide;
  b: TeamSheetSide;
  kickoff: string;
  venue: string;
}

function sideLength(side: TeamSheetSide): number {
  // A subs heading only appears when there are subs.
  return side.starters.length + (side.subs.length > 0 ? side.subs.length + 1 : 0);
}

export function teamSheetSize(props: TeamSheetImageProps): ImageSize {
  return {
    width: WIDTH,
    height: listHeight({
      rows: Math.max(sideLength(props.a), sideLength(props.b)),
      rowHeight: ROW,
      header: HEADER,
      footer: FOOTER,
      minHeight: 460,
    }),
  };
}

export function TeamSheetImage(props: TeamSheetImageProps): ReactElement {
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
      <HutStripe height={12} />

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: 40 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 800, letterSpacing: -1 }}>
            Teams are up
          </div>
          <div style={{ display: "flex", fontSize: 23, color: MUTED, marginTop: 10 }}>
            {fit(`${props.kickoff} · ${props.venue}`, 62)}
          </div>
        </div>

        <div
          style={{ display: "flex", height: 1, background: PALETTE.sand300, margin: "26px 0" }}
        />

        <div style={{ display: "flex", flexGrow: 1 }}>
          <Side side={props.a} />
          <div style={{ display: "flex", width: 1, background: PALETTE.sand300, margin: "0 28px" }} />
          <Side side={props.b} />
        </div>
      </div>
    </div>
  );
}

function Side({ side }: { side: TeamSheetSide }): ReactElement {
  const kit = teamColour(side.colour);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: 436 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        {/*
          The kit is a painted swatch and the team's name is ink beside it. That is
          what lets the light kit be light: when these images were drawn on near-black
          a white swatch was the only legible option and a dark one vanished, so the
          dark kit had to be faked as a mid grey.
        */}
        <div
          style={{
            display: "flex",
            width: 22,
            height: 22,
            background: kit,
            border: `1px solid ${kit === PALETTE.sand50 ? PALETTE.ink400 : kit}`,
            marginRight: 14,
          }}
        />
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>
          {fit(side.name, 18)}
        </div>
      </div>

      {side.starters.map((player) => (
        <div
          key={player.displayName}
          style={{ display: "flex", alignItems: "center", height: ROW - 12, marginBottom: 12 }}
        >
          <div style={{ display: "flex", marginRight: 16 }}>
            <HutMark colour={hutFor(player.displayName)} size={18} />
          </div>
          <div style={{ display: "flex", fontSize: 28, width: 46 }}>{player.emoji}</div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500 }}>
            {fit(player.displayName, 18)}
          </div>
        </div>
      ))}

      {side.subs.length > 0 ? (
        <div style={{ display: "flex", fontSize: 20, color: MUTED, marginTop: 10, marginBottom: 12 }}>
          Subs
        </div>
      ) : null}

      {side.subs.map((player) => (
        <div
          key={player.displayName}
          style={{ display: "flex", alignItems: "center", height: ROW - 12, marginBottom: 12 }}
        >
          <div style={{ display: "flex", marginRight: 16 }}>
            <HutMark colour={hutFor(player.displayName)} size={18} />
          </div>
          <div style={{ display: "flex", fontSize: 25, width: 46 }}>{player.emoji}</div>
          <div style={{ display: "flex", fontSize: 25, color: PALETTE.ink700 }}>
            {fit(player.displayName, 18)}
          </div>
        </div>
      ))}
    </div>
  );
}

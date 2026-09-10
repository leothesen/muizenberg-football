import type { ReactElement } from "react";
import { fit, listHeight, type ImageSize } from "./layout";
import { MUTED, PALETTE, teamColour } from "./theme";

/**
 * The team sheet.
 *
 * Two columns facing each other, because that is how people read a team sheet and
 * because the thing everybody checks first is which side they are on.
 */

/**
 * The fixed vertical cost of everything that is not a player row: outer padding, the
 * title and subtitle, the rule under them, and each column's team heading.
 *
 * These are measured from the rendered image, not guessed. Satori clips silently, so
 * an underestimate here does not error — it just quietly removes the balance note
 * from the bottom of the picture, which is how the first version shipped.
 */
const HEADER = 240;
const ROW = 56;
const FOOTER = 104;
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
  balanceNote: string;
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
        background: PALETTE.pitch900,
        padding: 36,
        color: PALETTE.sand,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 48 }}>Teams are up</div>
        <div style={{ display: "flex", fontSize: 24, color: MUTED, marginTop: 10 }}>
          {fit(`${props.kickoff} · ${props.venue}`, 62)}
        </div>
      </div>

      <div style={{ display: "flex", height: 2, background: PALETTE.pitch600, margin: "22px 0" }} />

      <div style={{ display: "flex", flexGrow: 1 }}>
        <Side side={props.a} />
        <div style={{ display: "flex", width: 2, background: PALETTE.pitch600, margin: "0 24px" }} />
        <Side side={props.b} />
      </div>

      <div style={{ display: "flex", fontSize: 24, color: MUTED, marginTop: 20 }}>
        {fit(props.balanceNote, 76)}
      </div>
    </div>
  );
}

function Side({ side }: { side: TeamSheetSide }): ReactElement {
  const accent = teamColour(side.colour);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: 440 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            width: 22,
            height: 22,
            borderRadius: 11,
            background: accent,
            marginRight: 14,
          }}
        />
        <div style={{ display: "flex", fontSize: 36, color: accent }}>{fit(side.name, 18)}</div>
      </div>

      {side.starters.map((player) => (
        <div
          key={player.displayName}
          style={{ display: "flex", alignItems: "center", height: ROW - 12, marginBottom: 12 }}
        >
          <div style={{ display: "flex", fontSize: 30, width: 50 }}>{player.emoji}</div>
          <div style={{ display: "flex", fontSize: 28 }}>{fit(player.displayName, 20)}</div>
        </div>
      ))}

      {side.subs.length > 0 ? (
        <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 8, marginBottom: 12 }}>
          Subs
        </div>
      ) : null}

      {side.subs.map((player) => (
        <div
          key={player.displayName}
          style={{ display: "flex", alignItems: "center", height: ROW - 12, marginBottom: 12 }}
        >
          <div style={{ display: "flex", fontSize: 26, width: 50 }}>{player.emoji}</div>
          <div style={{ display: "flex", fontSize: 24, color: MUTED }}>
            {fit(player.displayName, 20)}
          </div>
        </div>
      ))}
    </div>
  );
}

import type { ReactElement } from "react";
import type { TableRow } from "@/domain/leaderboards";
import { fit, listHeight, rankLabel, visibleRows, type ImageSize } from "./layout";
import { MUTED, PALETTE, ratingColour } from "./theme";

/**
 * The season table as a picture.
 *
 * Sized to its content rather than to a fixed canvas: a four-player table should not
 * be four rows floating in an ocean of empty pitch.
 */

const HEADER = 150;
const ROW = 74;
const FOOTER = 74;
const WIDTH = 900;

export function leaderboardSize(rowCount: number): ImageSize {
  return {
    width: WIDTH,
    height: listHeight({
      rows: Math.min(rowCount, 12),
      rowHeight: ROW,
      header: HEADER,
      footer: FOOTER,
      minHeight: 380,
    }),
  };
}

export interface LeaderboardImageProps {
  title: string;
  subtitle: string;
  rows: TableRow[];
}

export function LeaderboardImage(props: LeaderboardImageProps): ReactElement {
  const rows = visibleRows(props.rows);

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
        <div style={{ display: "flex", fontSize: 46 }}>{fit(props.title, 26)}</div>
        <div style={{ display: "flex", fontSize: 24, color: MUTED, marginTop: 10 }}>
          {fit(props.subtitle, 52)}
        </div>
      </div>

      <div style={{ display: "flex", height: 2, background: PALETTE.pitch600, margin: "22px 0" }} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((row) => (
          <div
            key={row.playerId}
            style={{
              display: "flex",
              alignItems: "center",
              height: ROW - 12,
              marginBottom: 12,
              background: PALETTE.pitch800,
              borderRadius: 16,
              paddingLeft: 20,
              paddingRight: 20,
            }}
          >
            <div style={{ display: "flex", width: 62, fontSize: 30, color: MUTED }}>
              {rankLabel(row.rank)}
            </div>
            <div style={{ display: "flex", fontSize: 34, width: 56 }}>{row.emoji}</div>
            <div style={{ display: "flex", fontSize: 30, flexGrow: 1 }}>
              {fit(row.displayName, 16)}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: MUTED, width: 190 }}>
              {`${row.wins}W ${row.draws}D ${row.losses}L`}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: MUTED, width: 96 }}>
              {`${row.goals} ⚽`}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 34,
                width: 92,
                justifyContent: "flex-end",
                color: ratingColour(row.rating),
              }}
            >
              {row.rating.toFixed(1)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexGrow: 1 }} />

      <div style={{ display: "flex", fontSize: 20, color: MUTED }}>
        {props.rows.length > rows.length
          ? `Showing ${rows.length} of ${props.rows.length} · rating moves with results, contribution and turning up`
          : "Rating moves with results, contribution and turning up"}
      </div>
    </div>
  );
}

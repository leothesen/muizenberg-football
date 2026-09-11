import type { ReactElement } from "react";
import type { TableRow } from "@/domain/leaderboards";
import { fit, listHeight, rankLabel, visibleRows, type ImageSize } from "./layout";
import { MUTED, PALETTE, ratingColour } from "./theme";
import { HutStripe } from "./huts";

/**
 * The season table as a picture.
 *
 * Sized to its content rather than to a fixed canvas: a four-player table should not
 * be four rows floating in an ocean of empty pitch.
 */

// +10 for the hut stripe along the top edge.
const HEADER = 160;
const ROW = 74;

/**
 * "4 won · 2 lost", not "4W 0D 2L".
 *
 * The shorthand is second nature in football and completely opaque to somebody
 * reading their first table, which is exactly who this picture is for. Nothing that
 * did not happen is printed: a nought beside "drew" is a word the reader has to
 * process to learn nothing, and three of them per row wrapped the column onto two
 * lines.
 */
function describeRecord(row: { wins: number; draws: number; losses: number }): string {
  const parts: string[] = [];
  if (row.wins > 0) parts.push(`${row.wins} won`);
  if (row.draws > 0) parts.push(`${row.draws} drew`);
  if (row.losses > 0) parts.push(`${row.losses} lost`);

  return parts.length > 0 ? parts.join(" · ") : "no games yet";
}
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
        color: PALETTE.sand,
        fontFamily: "sans-serif",
      }}
    >
      <HutStripe height={10} />

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: 36 }}>
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
            {/*
              Written out rather than "4W 1D 2L". The shorthand is second nature in
              football and completely opaque to somebody reading their first table,
              which is precisely who this picture is for.
            */}
            <div style={{ display: "flex", fontSize: 20, color: MUTED, width: 250 }}>
              {describeRecord(row)}
            </div>
            <div style={{ display: "flex", fontSize: 21, color: MUTED, width: 120 }}>
              {row.goals === 1 ? "1 goal" : `${row.goals} goals`}
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
    </div>
  );
}

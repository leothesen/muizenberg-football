import type { ReactElement } from "react";
import { describeRecord, type TableRow } from "@/domain/leaderboards";
import { fit, listHeight, rankLabel, visibleRows, type ImageSize } from "./layout";
import { MUTED, PALETTE, hutFor, ratingColour } from "./theme";
import { HutMark, HutStripe } from "./huts";

/**
 * The season table as a picture.
 *
 * Sized to its content rather than to a fixed canvas: a four-player table should not
 * be four rows floating in an ocean of empty beach.
 */

const HEADER = 150;
const ROW = 72;
const FOOTER = 74;
const WIDTH = 900;
const PAD = 40;

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
        background: PALETTE.sand50,
        color: PALETTE.ink900,
        fontFamily: "Archivo",
      }}
    >
      <HutStripe height={12} />

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: PAD }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>
            {fit(props.title, 26)}
          </div>
          {props.subtitle ? (
            <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 8 }}>
              {fit(props.subtitle, 52)}
            </div>
          ) : null}
        </div>

        <div
          style={{ display: "flex", height: 1, background: PALETTE.ink900, marginTop: 22 }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((row) => (
            <div
              key={row.playerId}
              style={{
                display: "flex",
                alignItems: "center",
                height: ROW,
                borderBottom: `1px solid ${PALETTE.sand200}`,
              }}
            >
              <div style={{ display: "flex", width: 54, fontSize: 24, color: MUTED }}>
                {rankLabel(row.rank)}
              </div>
              {/* Their hut, the same drawing as on their card and on the site. */}
              <div style={{ display: "flex", marginRight: 16 }}>
                <HutMark colour={hutFor(row.displayName)} size={18} />
              </div>
              <div style={{ display: "flex", fontSize: 30, width: 50 }}>{row.emoji}</div>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 600, flexGrow: 1 }}>
                {fit(row.displayName, 16)}
              </div>
              {/*
                Written out rather than "4W 1D 2L". The shorthand is second nature in
                football and completely opaque to somebody reading their first table,
                which is precisely who this picture is for.
              */}
              <div style={{ display: "flex", fontSize: 20, color: MUTED, width: 230 }}>
                {describeRecord(row)}
              </div>
              <div style={{ display: "flex", fontSize: 20, color: MUTED, width: 110 }}>
                {row.goals === 1 ? "1 goal" : `${row.goals} goals`}
              </div>
              {/* The rating is painted, exactly as it is on the website and the card. */}
              <div
                style={{
                  display: "flex",
                  width: 84,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  background: ratingColour(row.rating),
                  fontSize: 24,
                  fontWeight: 800,
                }}
              >
                {row.rating.toFixed(1)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexGrow: 1 }} />

        <div style={{ display: "flex", fontSize: 19, color: MUTED, marginTop: 22 }}>
          {props.rows.length > rows.length
            ? `Showing ${rows.length} of ${props.rows.length} · rating moves with results, contribution and turning up`
            : "Rating moves with results, contribution and turning up"}
        </div>
      </div>
    </div>
  );
}

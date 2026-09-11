import type { ReactElement } from "react";
import { fit, listHeight, rankLabel, type ImageSize } from "./layout";
import { MUTED, PALETTE, teamColour } from "./theme";
import { STAT_KINDS } from "@/lib/bot/stats";
import { HutStripe } from "./huts";

/**
 * The morning-after scoreboard.
 *
 * The score is the headline and everything else is smaller, because the argument
 * about who won is the one people actually have. Where the score was never agreed the
 * image says so rather than showing a dash and letting people assume 0-0.
 */

// +10 for the hut stripe along the top edge.
const HEADER = 310;
const ROW = 66;
// 92 plus a line for the emoji legend added underneath the movers.
const FOOTER = 128;
const WIDTH = 1000;

export interface MatchReportPerformer {
  displayName: string;
  emoji: string;
  line: string;
  points: number;
}

export interface MatchReportImageProps {
  kickoff: string;
  teamA: { name: string; colour: string };
  teamB: { name: string; colour: string };
  /** Null when nobody could agree on one. */
  score: { a: number; b: number } | null;
  agreement: string;
  motm: { displayName: string; emoji: string; votes: number }[];
  performers: MatchReportPerformer[];
}

function votesLabel(votes: number): string {
  return votes === 1 ? "1 vote" : `${votes} votes`;
}

export function matchReportSize(props: MatchReportImageProps): ImageSize {
  return {
    width: WIDTH,
    height: listHeight({
      rows: props.performers.length,
      rowHeight: ROW,
      header: HEADER + (props.motm.length > 0 ? 66 : 0),
      footer: FOOTER,
      minHeight: 460,
    }),
  };
}

export function MatchReportImage(props: MatchReportImageProps): ReactElement {
  const colourA = teamColour(props.teamA.colour);
  const colourB = teamColour(props.teamB.colour);

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
      <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
        {fit(`Full time · ${props.kickoff}`, 56)}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 22,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 340 }}>
          <div style={{ display: "flex", fontSize: 38, color: colourA }}>
            {fit(props.teamA.name, 14)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          {props.score ? (
            <div style={{ display: "flex", fontSize: 104, lineHeight: 1 }}>
              {`${props.score.a} – ${props.score.b}`}
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 44, color: MUTED }}>no agreed score</div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 340,
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", fontSize: 38, color: colourB }}>
            {fit(props.teamB.name, 14)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 16 }}>
        {fit(props.agreement, 78)}
      </div>

      {props.motm.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
          <div style={{ display: "flex", fontSize: 30, marginRight: 12 }}>⭐</div>
          <div style={{ display: "flex", fontSize: 30 }}>
            {fit(
              props.motm.map((m) => `${m.emoji} ${m.displayName}`).join(", "),
              44,
            )}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: MUTED, marginLeft: 12 }}>
            {votesLabel(props.motm[0]?.votes ?? 0)}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", height: 2, background: PALETTE.pitch600, margin: "26px 0" }} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        {props.performers.map((performer, index) => (
          <div
            key={performer.displayName}
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
            <div style={{ display: "flex", width: 56, fontSize: 28, color: MUTED }}>
              {rankLabel(index + 1)}
            </div>
            <div style={{ display: "flex", fontSize: 30, width: 52 }}>{performer.emoji}</div>
            <div style={{ display: "flex", fontSize: 28, width: 240 }}>
              {fit(performer.displayName, 14)}
            </div>
            <div style={{ display: "flex", fontSize: 26, color: MUTED, flexGrow: 1 }}>
              {fit(performer.line, 30)}
            </div>
            <div style={{ display: "flex", fontSize: 26 }}>{`${performer.points.toFixed(1)} pts`}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexGrow: 1 }} />

      {/*
        A legend, because the rows above are pure emoji and a stat nobody can read is
        a stat nobody cares about. There is no room to label each number in place —
        one row per player is tight already — so the key goes once, at the bottom,
        where a reader who does not recognise 🥜 can find it without asking.
      */}
      <div style={{ display: "flex", fontSize: 19, color: MUTED, marginBottom: 8 }}>
        {STAT_KINDS.map((kind) => `${kind.emoji} ${kind.many}`).join("   ")}
      </div>

      <div style={{ display: "flex", fontSize: 20, color: MUTED }}>
        Every number self-reported
      </div>
      </div>
    </div>
  );
}

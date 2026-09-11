import type { ReactElement } from "react";
import { fit, listHeight, rankLabel, type ImageSize } from "./layout";
import { MUTED, PALETTE, hutFor, teamColour } from "./theme";
import { STAT_KINDS } from "@/lib/bot/stats";
import { HutMark, HutStripe } from "./huts";

/**
 * The morning-after scoreboard.
 *
 * The score is the headline and everything else is smaller, because the argument
 * about who won is the one people actually have. Where the score was never agreed the
 * image says so rather than showing a dash and letting people assume 0-0.
 */

const HEADER = 300;
const ROW = 64;
// 92, plus a line for the emoji legend underneath the movers.
const FOOTER = 128;
const WIDTH = 1000;
const PAD = 40;

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
      header: HEADER + (props.motm.length > 0 ? 62 : 0),
      footer: FOOTER,
      minHeight: 460,
    }),
  };
}

/** A kit swatch. The light kit needs an edge or it is a hole in the page. */
function Kit({ colour }: { colour: string }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        width: 18,
        height: 18,
        background: colour,
        border: `1px solid ${colour === PALETTE.sand50 ? PALETTE.ink400 : colour}`,
        marginRight: 12,
      }}
    />
  );
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
        background: PALETTE.sand50,
        color: PALETTE.ink900,
        fontFamily: "Archivo",
      }}
    >
      <HutStripe height={12} />

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: PAD }}>
        <div style={{ display: "flex", fontSize: 22, color: MUTED }}>
          {fit(`Full time · ${props.kickoff}`, 56)}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", width: 330 }}>
            <Kit colour={colourA} />
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
              {fit(props.teamA.name, 13)}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            {props.score ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 100,
                  fontWeight: 800,
                  letterSpacing: -3,
                  lineHeight: 1,
                }}
              >
                {`${props.score.a}–${props.score.b}`}
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: 38, color: MUTED }}>no agreed score</div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              width: 330,
            }}
          >
            <Kit colour={colourB} />
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
              {fit(props.teamB.name, 13)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 21, color: MUTED, marginTop: 14 }}>
          {fit(props.agreement, 78)}
        </div>

        {props.motm.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", marginTop: 24 }}>
            <div style={{ display: "flex", fontSize: 26, marginRight: 12 }}>⭐</div>
            <div style={{ display: "flex", fontSize: 27, fontWeight: 600 }}>
              {fit(props.motm.map((m) => `${m.emoji} ${m.displayName}`).join(", "), 44)}
            </div>
            <div style={{ display: "flex", fontSize: 21, color: MUTED, marginLeft: 12 }}>
              {votesLabel(props.motm[0]?.votes ?? 0)}
            </div>
          </div>
        ) : null}

        <div
          style={{ display: "flex", height: 1, background: PALETTE.ink900, marginTop: 26 }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {props.performers.map((performer, index) => (
            <div
              key={performer.displayName}
              style={{
                display: "flex",
                alignItems: "center",
                height: ROW,
                borderBottom: `1px solid ${PALETTE.sand200}`,
              }}
            >
              <div style={{ display: "flex", width: 50, fontSize: 24, color: MUTED }}>
                {rankLabel(index + 1)}
              </div>
              <div style={{ display: "flex", marginRight: 16 }}>
                <HutMark colour={hutFor(performer.displayName)} size={18} />
              </div>
              <div style={{ display: "flex", fontSize: 28, width: 50 }}>{performer.emoji}</div>
              <div style={{ display: "flex", fontSize: 26, fontWeight: 600, width: 220 }}>
                {fit(performer.displayName, 14)}
              </div>
              <div style={{ display: "flex", fontSize: 23, color: MUTED, flexGrow: 1 }}>
                {fit(performer.line, 30)}
              </div>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>
                {`${performer.points.toFixed(1)} pts`}
              </div>
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
        <div style={{ display: "flex", fontSize: 18, color: MUTED, marginTop: 22 }}>
          {STAT_KINDS.map((kind) => `${kind.emoji} ${kind.many}`).join("   ")}
        </div>

        <div style={{ display: "flex", fontSize: 18, color: MUTED, marginTop: 8 }}>
          Every number self-reported
        </div>
      </div>
    </div>
  );
}

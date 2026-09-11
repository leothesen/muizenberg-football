import type { ReactElement } from "react";
import type { ImageSize } from "./layout";
import { MUTED, PALETTE } from "./theme";
import { HutStripe } from "./huts";

/**
 * The picture a newcomer gets when they join the group.
 *
 * The welcome text tells somebody they are in the league. This tells them what that
 * actually means, which is the thing a wall of text is worst at: three stages, in
 * order, with the time each one happens and what is expected of them at it. Read in
 * about four seconds, which is roughly how long a new person looks at a group chat
 * before scrolling on.
 *
 * Fixed size, unlike the team sheet and the leaderboard — there are always exactly
 * three stages, so nothing here grows with the data and there is no list arithmetic
 * to get wrong.
 */

const WIDTH = 1000;

/**
 * Measured rather than guessed.
 *
 * An early version was 520 and the closing line simply was not in the picture:
 * Satori clips without erroring, so the render succeeded, the test suite passed, and
 * the only way to find out was to open the PNG. Anything added below the panels needs
 * this raised and the image looked at again.
 */
const HEIGHT = 520;

/**
 * Three panels and two gaps across the content width: 1000 less 40 of padding each
 * side is 920, and 280 * 3 + 40 * 2 is 920 exactly. Widening a panel means narrowing
 * a gap, or a headline wraps and the captions stop lining up.
 */
const PANEL = 280;
const GAP = 40;

/** Two lines of caption, so all three sit on the same baseline whatever they say. */
const YOUR_PART = 56;

/** The times are not decoration: a test holds them to the crons in vercel.json. */
export interface WeekStage {
  /** Local time, the way a player thinks about it — SAST, not the cron's UTC. */
  when: string;
  headline: string;
  detail: string;
  /** What the newcomer does, printed under the panel. */
  yourPart: string;
  accent: string;
}

export const WEEK_STAGES: readonly WeekStage[] = [
  {
    when: "DAY BEFORE",
    headline: "Who's in?",
    detail: "✅  ❌  🤔",
    yourPart: "You tap ✅",
    accent: PALETTE.hutYellow,
  },
  {
    when: "MATCH DAY",
    headline: "Teams",
    detail: "6 v 5",
    yourPart: "You're on the team sheet",
    accent: PALETTE.hutBlue,
  },
  {
    when: "NEXT MORNING",
    headline: "9 — 8",
    detail: "MOTM Jonty",
    yourPart: "Ratings move, badges land",
    accent: PALETTE.hutGreen,
  },
] as const;

export function welcomeSize(): ImageSize {
  return { width: WIDTH, height: HEIGHT };
}

export function WelcomeImage(): ReactElement {
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
        {/*
          No eyebrow. This said MUIZENBERG WEDNESDAYS, which named a night the group no
          longer commits to and a club that does not exist yet. The headline carries the
          picture on its own until there is a real name to put above it.
        */}
        <div style={{ display: "flex", fontSize: 54, fontWeight: 800, letterSpacing: -1.2 }}>
          How the week works
        </div>

        <div
          style={{ display: "flex", height: 1, background: PALETTE.ink900, margin: "24px 0" }}
        />

        <div style={{ display: "flex", flexGrow: 1, alignItems: "flex-start" }}>
          {WEEK_STAGES.map((stage, index) => (
            <div
              key={stage.when}
              style={{
                display: "flex",
                marginRight: index < WEEK_STAGES.length - 1 ? GAP : 0,
              }}
            >
              <Stage stage={stage} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 20 }}>
          No signup, no password. Being in this chat is being in the league.
        </div>
      </div>
    </div>
  );
}

/**
 * A stage, drawn as a hut.
 *
 * These were three rounded panels with a thick coloured bar down the left edge, which
 * is a stock accent rather than a decision and said nothing about this league. A
 * painted front with the stage label written on it is the same information in the
 * shape the whole design is named after, and it needs no arrow between the panels —
 * a row of huts already reads left to right.
 */
function Stage({ stage }: { stage: WeekStage }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: PANEL }}>
      {/* The painted front. Ink on paint, never paint as lettering. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 44,
          paddingLeft: 18,
          background: stage.accent,
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        {stage.when}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 22,
          height: 150,
          background: PALETTE.sand100,
        }}
      >
        <div style={{ display: "flex", fontSize: 38, fontWeight: 800, letterSpacing: -0.8 }}>
          {stage.headline}
        </div>
        <div style={{ display: "flex", fontSize: 25, color: MUTED, marginTop: 12 }}>
          {stage.detail}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 20,
          color: MUTED,
          marginTop: 14,
          // Fixed, because "Ratings move, badges land" takes two lines and the others
          // take one. Left to size itself, the three panels end at different heights
          // and the row reads as sloppy rather than as a sequence.
          height: YOUR_PART,
        }}
      >
        {stage.yourPart}
      </div>
    </div>
  );
}

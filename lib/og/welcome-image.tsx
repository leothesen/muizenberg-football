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
 * 600, and measured rather than guessed.
 *
 * The first version was 520 and the closing line simply was not in the picture:
 * Satori clips without erroring, so the render succeeded, the test suite passed, and
 * the only way to find out was to open the PNG. Anything added below the panels needs
 * this raised and the image looked at again.
 */
// 590 of content plus the 10px hut stripe along the top edge.
const HEIGHT = 610;

/**
 * Three panels and two arrows across the content width: 1000 less 44 of padding each
 * side is 912, and 268 * 3 + 54 * 2 is 912 exactly. Widening a panel means narrowing
 * an arrow, or a headline wraps and the captions stop lining up.
 */
const PANEL = 268;
const ARROW = 54;

/** Two lines of caption, so all three sit on the same baseline whatever they say. */
const YOUR_PART = 58;

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
        background: PALETTE.pitch900,
        color: PALETTE.sand,
        fontFamily: "sans-serif",
      }}
    >
      <HutStripe height={10} />

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: 44 }}>
      {/*
        No eyebrow. This said MUIZENBERG WEDNESDAYS, which named a night the group no
        longer commits to and a club that does not exist yet. The headline carries the
        picture on its own until there is a real name to put above it.
      */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 52 }}>How the week works</div>
      </div>

      <div
        style={{
          display: "flex",
          height: 2,
          background: PALETTE.pitch600,
          margin: "26px 0",
        }}
      />

      <div style={{ display: "flex", flexGrow: 1, alignItems: "flex-start" }}>
        {WEEK_STAGES.map((stage, index) => (
          <div
            key={stage.when}
            style={{ display: "flex", alignItems: "center" }}
          >
            <Stage stage={stage} />
            {index < WEEK_STAGES.length - 1 ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 40,
                  color: PALETTE.pitch500,
                  width: ARROW,
                  justifyContent: "center",
                }}
              >
                →
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div
        style={{ display: "flex", fontSize: 24, color: MUTED, marginTop: 24 }}
      >
        No signup, no password. Being in this chat is being in the league.
      </div>
      </div>
    </div>
  );
}

function Stage({ stage }: { stage: WeekStage }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: PANEL }}>
      <div
        style={{
          display: "flex",
          fontSize: 19,
          letterSpacing: 2,
          color: stage.accent,
        }}
      >
        {stage.when}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 12,
          padding: 22,
          height: 168,
          borderRadius: 18,
          background: PALETTE.pitch700,
          // A left rail in the stage's colour, so the three read as a sequence of
          // distinct things rather than three identical cards.
          borderLeft: `6px solid ${stage.accent}`,
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", fontSize: 38 }}>{stage.headline}</div>
        <div
          style={{ display: "flex", fontSize: 26, color: MUTED, marginTop: 14 }}
        >
          {stage.detail}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 21,
          color: MUTED,
          marginTop: 16,
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

import type { ReactElement } from "react";
import type { CardAttributes } from "@/domain/rating";
import { attributeRows, fit, type ImageSize } from "./layout";
import { FORM_COLOURS, MUTED, PALETTE, hutFor, ratingBand, ratingColour } from "./theme";
import { HutStripe } from "./huts";
import { STAT_KINDS } from "@/lib/bot/stats";

/**
 * The player card.
 *
 * Everything on it is something the league actually measured. There is no pace, no
 * physical, no invented positional rating — a card that showed numbers nobody
 * collected would be the one part of an honesty-based system that was lying.
 *
 * Written as flat flexbox with inline styles because Satori supports nothing else:
 * no CSS classes, no grid, and every element with more than one child needs an
 * explicit `display: flex`.
 */

/**
 * A card is a fixed shape on purpose — two cards side by side should be comparable —
 * so the content has to fit rather than the canvas growing to meet it. The height
 * below is the measured worst case (full attribute block, a form strip and two rows
 * of badges) plus room to breathe. Satori clips silently, so getting this wrong loses
 * the footer with no error anywhere.
 */
export const PLAYER_CARD_SIZE: ImageSize = { width: 720, height: 1100 };

/** Two rows' worth. More than this and the card overflows its own frame. */
export const MAX_CARD_BADGES = 4;

/**
 * Every attribute row is laid out to a fixed budget rather than left to flexGrow.
 *
 * 720 wide, less 36 of page padding and 36 of card padding on each side, is 576 of
 * usable row. Label 168 and value 62 leave 330 for the bar. Spelling the labels out
 * broke this the first time: "Reputation" is wider than the other five, so with a
 * growing bar that one row ran off the edge of the card while the others sat inside
 * it. Satori clips without complaining, so the overflow was visible and silent.
 */
const BAR_WIDTH = 330;

export interface PlayerCardProps {
  displayName: string;
  emoji: string;
  rating: number;
  appearances: number;
  attributes: CardAttributes;
  /** Oldest to newest, as the strip reads. */
  form: ("W" | "D" | "L")[];
  totals: {
    goals: number;
    assists: number;
    nutmegs: number;
    tackles: number;
    saves: number;
    motmVotes: number;
  };
  badges: { emoji: string; name: string }[];
  seasonName: string;
}


export function PlayerCardImage(props: PlayerCardProps): ReactElement {
  const accent = ratingColour(props.rating);
  // The player's own hut, stable for life. Their card, their row in the table and
  // their name on the team sheet all carry it, so a person reads as a colour rather
  // than a position. The rating keeps its own band colour — that one means something.
  const hut = hutFor(props.displayName);
  const rows = attributeRows(props.attributes);

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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          borderRadius: 32,
          border: `3px solid ${hut}`,
          background: PALETTE.pitch800,
          overflow: "hidden",
        }}
      >
        <HutStripe height={10} />

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: 36 }}>
        {/* Rating and name */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 190 }}>
            <div style={{ display: "flex", fontSize: 116, color: accent, lineHeight: 1 }}>
              {props.rating.toFixed(0)}
            </div>
            <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 6 }}>
              {ratingBand(props.rating)}
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 96, marginLeft: 8 }}>{props.emoji}</div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginLeft: 20,
              flexGrow: 1,
            }}
          >
            <div style={{ display: "flex", fontSize: 46, lineHeight: 1.1 }}>
              {fit(props.displayName, 14)}
            </div>
            <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 8 }}>
              {props.appearances === 1 ? "1 game" : `${props.appearances} games`}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", height: 2, background: PALETTE.pitch600, margin: "28px 0" }} />

        {/* Attributes */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((row) => (
            <div
              key={row.key}
              style={{ display: "flex", alignItems: "center", marginBottom: 18 }}
            >
              {/*
                flexShrink: 0 is load-bearing, not decoration. Without it Satori sizes
                this column to its content, so the one long label — "Reputation" —
                pushed its own value and bar out of line with the five above it.
              */}
              <div
                style={{
                  display: "flex",
                  width: 168,
                  flexShrink: 0,
                  fontSize: 21,
                  color: MUTED,
                }}
              >
                {row.label}
              </div>
              <div style={{ display: "flex", width: 62, flexShrink: 0, fontSize: 30 }}>
                {row.value}
              </div>
              <div
                style={{
                  display: "flex",
                  width: BAR_WIDTH,
                  flexShrink: 0,
                  height: 16,
                  borderRadius: 8,
                  background: PALETTE.pitch600,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: Math.round((BAR_WIDTH * row.percent) / 100),
                    height: 16,
                    borderRadius: 8,
                    background: accent,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", height: 2, background: PALETTE.pitch600, margin: "14px 0 28px" }} />

        {/* Career totals */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {STAT_KINDS.map((kind) => (
            <div
              key={kind.key}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 96 }}
            >
              <div style={{ display: "flex", fontSize: 34 }}>{kind.emoji}</div>
              <div style={{ display: "flex", fontSize: 32, marginTop: 8 }}>
                {props.totals[kind.key]}
              </div>
              {/* The word under the number. A column of six pictures is a quiz. */}
              <div style={{ display: "flex", fontSize: 17, color: MUTED, marginTop: 6 }}>
                {kind.short}
              </div>
            </div>
          ))}
        </div>

        {props.form.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", marginTop: 34 }}>
            <div style={{ display: "flex", fontSize: 24, color: MUTED, width: 92 }}>Form</div>
            <div style={{ display: "flex" }}>
              {props.form.map((mark, index) => (
                <div
                  key={`${mark}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    marginRight: 10,
                    background: FORM_COLOURS[mark],
                    color: PALETTE.pitch900,
                    fontSize: 22,
                  }}
                >
                  {mark}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", flexGrow: 1 }} />

        {props.badges.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 18 }}>
            {props.badges.map((badge) => (
              <div
                key={badge.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: PALETTE.pitch700,
                  borderRadius: 18,
                  padding: "8px 16px",
                  marginRight: 10,
                  marginBottom: 10,
                  fontSize: 22,
                }}
              >
                <div style={{ display: "flex", marginRight: 8 }}>{badge.emoji}</div>
                <div style={{ display: "flex", color: MUTED }}>{fit(badge.name, 18)}</div>
              </div>
            ))}
          </div>
        ) : null}

        {/*
          The league name is not repeated here. The season is called "Muizenberg
          Wednesdays", so hardcoding the league in front of it printed the same words
          twice on every card that has ever been sent.
        */}
        {/*
          The league name is not printed here. The season is the only name on the card
          — hardcoding a club in front of it printed the same words twice on every
          card, and there is no club name yet in any case.
        */}
        <div style={{ display: "flex", fontSize: 20, color: MUTED }}>
          {props.seasonName
            ? `${fit(props.seasonName, 32)} · every number self-reported`
            : "Every number self-reported"}
        </div>
        </div>
      </div>
    </div>
  );
}

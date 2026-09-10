import type { ReactElement } from "react";
import type { CardAttributes } from "@/domain/rating";
import { attributeRows, fit, type ImageSize } from "./layout";
import { FORM_COLOURS, MUTED, PALETTE, ratingBand, ratingColour } from "./theme";

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

const TOTALS: [keyof PlayerCardProps["totals"], string][] = [
  ["goals", "⚽"],
  ["assists", "🎁"],
  ["nutmegs", "🥜"],
  ["tackles", "🧱"],
  ["saves", "🧤"],
  ["motmVotes", "⭐"],
];

export function PlayerCardImage(props: PlayerCardProps): ReactElement {
  const accent = ratingColour(props.rating);
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
          border: `3px solid ${accent}`,
          background: PALETTE.pitch800,
          padding: 36,
        }}
      >
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
              <div style={{ display: "flex", width: 74, fontSize: 26, color: MUTED }}>
                {row.label}
              </div>
              <div style={{ display: "flex", width: 62, fontSize: 30 }}>{row.value}</div>
              <div
                style={{
                  display: "flex",
                  flexGrow: 1,
                  height: 16,
                  borderRadius: 8,
                  background: PALETTE.pitch600,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: `${row.percent}%`,
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
          {TOTALS.map(([key, icon]) => (
            <div
              key={key}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 96 }}
            >
              <div style={{ display: "flex", fontSize: 34 }}>{icon}</div>
              <div style={{ display: "flex", fontSize: 32, marginTop: 8 }}>
                {props.totals[key]}
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

        <div style={{ display: "flex", fontSize: 20, color: MUTED }}>
          {`Muizenberg Wednesdays · ${fit(props.seasonName, 22)} · self-reported`}
        </div>
      </div>
    </div>
  );
}

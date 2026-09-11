import type { ReactElement } from "react";
import type { CardAttributes } from "@/domain/rating";
import { attributeRows, fit, type ImageSize } from "./layout";
import { FORM_COLOURS, MUTED, PALETTE, hutFor, ratingBand, ratingColour } from "./theme";
import { HutMark, HutStripe } from "./huts";
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
 * below is the measured worst case plus room to breathe. Satori clips silently, so
 * getting this wrong loses the footer with no error anywhere.
 */
export const PLAYER_CARD_SIZE: ImageSize = { width: 720, height: 860 };

/** Two rows' worth. More than this and the card overflows its own frame. */
export const MAX_CARD_BADGES = 4;

/**
 * Every attribute row is laid out to a fixed budget rather than left to flexGrow.
 *
 * 720 wide, less 40 of padding on each side, is 640 of usable row. Label 170 and
 * value 70 leave 400 for the bar. Spelling the labels out broke this the first time:
 * "Reputation" is wider than the other five, so with a growing bar that one row ran
 * off the edge of the card while the others sat inside it — visibly, and silently.
 */
const BAR_WIDTH = 400;
const PAD = 40;

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
  const band = ratingColour(props.rating);
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
        background: PALETTE.sand50,
        color: PALETTE.ink900,
        fontFamily: "Archivo",
      }}
    >
      <HutStripe height={12} />

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: PAD }}>
        {/* Rating, painted. The figure is ink on the band colour, which is the rule
            the whole palette runs on: bright paint is a fill, never lettering. */}
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 168,
              height: 168,
              background: band,
            }}
          >
            <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1 }}>
              {props.rating.toFixed(0)}
            </div>
            <div style={{ display: "flex", fontSize: 19, marginTop: 6 }}>
              {ratingBand(props.rating)}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              marginLeft: 28,
              flexGrow: 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 56, marginRight: 14 }}>
                {props.emoji}
              </div>
              {/* Their hut, the same drawing that stands beside their name in the
                  table and frames this card on the website. */}
              <HutMark colour={hut} size={30} />
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 46,
                fontWeight: 800,
                letterSpacing: -0.8,
                marginTop: 8,
              }}
            >
              {fit(props.displayName, 15)}
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
              <div style={{ display: "flex", fontSize: 21, color: MUTED }}>
                {props.appearances === 1 ? "1 game" : `${props.appearances} games`}
              </div>
              {props.form.length > 0 ? (
                <div style={{ display: "flex", marginLeft: 16 }}>
                  {props.form.map((mark, index) => (
                    <div
                      key={`${mark}-${index}`}
                      style={{
                        display: "flex",
                        width: 18,
                        height: 18,
                        marginRight: 5,
                        background: FORM_COLOURS[mark],
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <Rule top={30} bottom={26} />

        {/* Attributes */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((row) => (
            <div
              key={row.key}
              style={{ display: "flex", alignItems: "center", marginBottom: 16 }}
            >
              {/*
                flexShrink: 0 is load-bearing, not decoration. Without it Satori sizes
                this column to its content, so the one long label — "Reputation" —
                pushed its own value and bar out of line with the five above it.
              */}
              <div
                style={{ display: "flex", width: 170, flexShrink: 0, fontSize: 21, color: MUTED }}
              >
                {row.label}
              </div>
              <div
                style={{
                  display: "flex",
                  width: 70,
                  flexShrink: 0,
                  fontSize: 28,
                  fontWeight: 700,
                }}
              >
                {row.value}
              </div>
              <div
                style={{
                  display: "flex",
                  width: BAR_WIDTH,
                  flexShrink: 0,
                  height: 12,
                  background: PALETTE.sand200,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: Math.round((BAR_WIDTH * row.percent) / 100),
                    height: 12,
                    background: band,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <Rule top={12} bottom={26} />

        {/* Career totals. The word under the number, because a row of six pictures
            is a quiz. */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {STAT_KINDS.map((kind) => (
            <div
              key={kind.key}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 100 }}
            >
              <div style={{ display: "flex", fontSize: 28 }}>{kind.emoji}</div>
              <div
                style={{ display: "flex", fontSize: 32, fontWeight: 800, marginTop: 6 }}
              >
                {props.totals[kind.key]}
              </div>
              <div style={{ display: "flex", fontSize: 16, color: MUTED, marginTop: 4 }}>
                {kind.short}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexGrow: 1 }} />

        {props.badges.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: 22 }}>
            {props.badges.map((badge) => (
              <div
                key={badge.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: PALETTE.sand100,
                  padding: "7px 14px",
                  marginRight: 8,
                  marginBottom: 8,
                  fontSize: 20,
                }}
              >
                <div style={{ display: "flex", marginRight: 8 }}>{badge.emoji}</div>
                <div style={{ display: "flex", color: PALETTE.ink700 }}>
                  {fit(badge.name, 18)}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/*
          The league name is not printed here. The season is the only name on the card
          — hardcoding a club in front of it printed the same words twice on every
          card, and there is no club name yet in any case.
        */}
        <div style={{ display: "flex", fontSize: 18, color: MUTED, marginTop: 24 }}>
          {props.seasonName
            ? `${fit(props.seasonName, 32)} · every number self-reported`
            : "Every number self-reported"}
        </div>
      </div>
    </div>
  );
}

/** A hairline, which on sand is a faint line rather than a lighter block. */
function Rule({ top, bottom }: { top: number; bottom: number }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        height: 1,
        background: PALETTE.sand300,
        marginTop: top,
        marginBottom: bottom,
      }}
    />
  );
}

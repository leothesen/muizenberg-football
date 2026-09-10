import { describe, expect, it } from "vitest";
import type { SeasonStatRow } from "@/domain/leaderboards";
import type { CareerStatRow, FixtureStatRow } from "@/domain/records";
import type { TelegramInlineQuery } from "@/lib/telegram/types";
import { buildInlineAnswer, INLINE_CACHE_SECONDS, type InlineContext } from "./inline";

function seasonRow(overrides: Partial<SeasonStatRow> & { playerId: string }): SeasonStatRow {
  return {
    displayName: overrides.playerId,
    emoji: "⚽",
    rating: 65,
    appearances: 4,
    goals: 0,
    assists: 0,
    nutmegs: 0,
    tackles: 0,
    saves: 0,
    ownGoals: 0,
    motmVotes: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    avgSelfRating: null,
    ...overrides,
  };
}

const CAREER: CareerStatRow[] = [
  {
    playerId: "p1",
    displayName: "Ann",
    emoji: "🦊",
    appearances: 6,
    goals: 9,
    assists: 3,
    nutmegs: 5,
    tackles: 14,
    saves: 2,
    motmVotes: 4,
    rating: 74,
  },
];

const FIXTURES: FixtureStatRow[] = [
  {
    playerId: "p1",
    displayName: "Ann",
    emoji: "🦊",
    fixtureId: "w1",
    kickoffAt: new Date("2026-08-12T16:00:00Z"),
    goals: 4,
    assists: 1,
    nutmegs: 2,
    tackles: 3,
    saves: 0,
    motmVotes: 2,
    outcome: "win",
    goalsFor: 7,
    goalsAgainst: 3,
  },
];

function context(overrides: Partial<InlineContext> = {}): InlineContext {
  return {
    seasonName: "Spring 2026",
    seasonRows: [
      seasonRow({ playerId: "p1", displayName: "Ann", rating: 74, goals: 9, wins: 4 }),
      seasonRow({ playerId: "p2", displayName: "Bob", rating: 62, nutmegs: 6 }),
    ],
    careerRows: CAREER,
    fixtureRows: FIXTURES,
    streaks: {
      fixtureIdsOldestFirst: ["w1"],
      byPlayer: new Map([
        [
          "p1",
          {
            holder: { playerId: "p1", displayName: "Ann", emoji: "🦊" },
            fixtureIds: new Set(["w1"]),
          },
        ],
      ]),
    },
    ...overrides,
  };
}

function query(text: string): TelegramInlineQuery {
  return {
    id: "inline-1",
    from: { id: 999, is_bot: false, first_name: "Ann" },
    query: text,
    offset: "",
    chat_type: "group",
  };
}

describe("buildInlineAnswer", () => {
  it("offers everything for an empty query", () => {
    const answer = buildInlineAnswer(query(""), context());
    expect(answer.results.map((r) => r.id)).toEqual(["table", "leaders", "records"]);
  });

  it("narrows to the table when asked for one", () => {
    expect(buildInlineAnswer(query("table"), context()).results.map((r) => r.id)).toEqual([
      "table",
    ]);
  });

  it("matches on a prefix, because people type as they go", () => {
    expect(buildInlineAnswer(query("rec"), context()).results.map((r) => r.id)).toEqual([
      "records",
    ]);
    expect(buildInlineAnswer(query("lead"), context()).results.map((r) => r.id)).toEqual([
      "leaders",
    ]);
  });

  it("ignores case and stray whitespace", () => {
    expect(buildInlineAnswer(query("  TABLE "), context()).results.map((r) => r.id)).toEqual([
      "table",
    ]);
  });

  it("falls back to everything rather than showing an empty list", () => {
    // An empty inline result list looks exactly like a broken bot.
    const answer = buildInlineAnswer(query("elephants"), context());
    expect(answer.results.length).toBeGreaterThan(0);
  });

  it("puts real content in the message, not a placeholder", () => {
    const answer = buildInlineAnswer(query("table"), context());
    const text = answer.results[0]?.input_message_content.message_text ?? "";

    expect(text).toContain("Spring 2026");
    expect(text).toContain("Ann");
    expect(answer.results[0]?.input_message_content.parse_mode).toBe("HTML");
  });

  it("describes the result so the picker is readable before it is sent", () => {
    const table = buildInlineAnswer(query("table"), context()).results[0];
    expect(table?.title).toContain("table");
    expect(table?.description).toContain("Ann");
  });

  it("turns off link previews, which would push a long table off screen", () => {
    const answer = buildInlineAnswer(query("table"), context());
    expect(answer.results[0]?.input_message_content.link_preview_options).toEqual({
      is_disabled: true,
    });
  });

  it("uses article results only, because a photo url must be fetchable by Telegram", () => {
    for (const result of buildInlineAnswer(query(""), context()).results) {
      expect(result.type).toBe("article");
    }
  });

  it("caches, since the league moves once a week", () => {
    const answer = buildInlineAnswer(query(""), context());
    expect(answer.cache_time).toBe(INLINE_CACHE_SECONDS);
    // Nothing here is personal, so everyone can share the cached answer.
    expect(answer.is_personal).toBe(false);
  });

  it("offers the Mini App above the results when there is one", () => {
    const answer = buildInlineAnswer(
      query(""),
      context({ miniAppUrl: "https://league.example.com/app" }),
    );
    expect(answer.button).toEqual({
      text: "Open the league",
      web_app: { url: "https://league.example.com/app" },
    });
  });

  it("leaves the button off when the Mini App has no home yet", () => {
    expect(buildInlineAnswer(query(""), context()).button).toBeUndefined();
  });

  it("still answers when the season is empty", () => {
    const answer = buildInlineAnswer(
      query(""),
      context({ seasonRows: [], careerRows: [], fixtureRows: [] }),
    );
    expect(answer.results.length).toBeGreaterThan(0);
    expect(answer.results[0]?.input_message_content.message_text.length).toBeGreaterThan(0);
  });

  it("gives every result a distinct id, which Telegram requires", () => {
    const ids = buildInlineAnswer(query(""), context()).results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(Buffer.byteLength(id)).toBeLessThanOrEqual(64);
  });

  it("answers the query it was given", () => {
    expect(buildInlineAnswer(query("table"), context()).inline_query_id).toBe("inline-1");
  });
});

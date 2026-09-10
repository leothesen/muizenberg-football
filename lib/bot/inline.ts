import { allLeaderboards, ratingTable, type SeasonStatRow } from "@/domain/leaderboards";
import { hallOfFame, longestStreak, type CareerStatRow, type FixtureStatRow, type RecordHolder } from "@/domain/records";
import type {
  AnswerInlineQueryParams,
  InlineQueryResultArticle,
  TelegramInlineQuery,
} from "@/lib/telegram/types";
import { leaderboardMessage, recordsMessage, tableMessage } from "./results";

/**
 * Inline mode: typing `@thebot table` in any chat at all.
 *
 * This is the one part of the bot that works where the bot is not. Somebody arguing
 * about who is top of the table in a completely different group can settle it without
 * anybody being added to anything, which is a nicer answer than a screenshot.
 *
 * Results are `article` rather than `photo` on purpose. A photo result needs a
 * `photo_url` that *Telegram* can fetch, so it would be broken on a laptop, broken on
 * a preview deployment, and only ever work in production — the worst possible place
 * to discover a mistake. An article carries the message itself and works everywhere.
 */

export interface InlineContext {
  seasonName: string;
  seasonRows: SeasonStatRow[];
  careerRows: CareerStatRow[];
  fixtureRows: FixtureStatRow[];
  streaks: {
    fixtureIdsOldestFirst: string[];
    byPlayer: Map<string, { holder: RecordHolder; fixtureIds: ReadonlySet<string> }>;
  };
  /** Absent until the Mini App has a public home. */
  miniAppUrl?: string;
}

/**
 * Telegram caches inline answers for everyone by default. The league moves once a
 * week, so a few minutes is plenty fresh and saves rebuilding the same table for
 * sixteen people in a row.
 */
export const INLINE_CACHE_SECONDS = 120;

/** Telegram allows 50; the bot never has anything like that many things to say. */
const MAX_RESULTS = 4;

interface Candidate {
  id: string;
  title: string;
  description: string;
  /** Words that should surface this result. */
  keywords: string[];
  text: () => string;
}

export function buildInlineAnswer(
  query: TelegramInlineQuery,
  ctx: InlineContext,
): AnswerInlineQueryParams {
  const candidates = candidatesFor(ctx);
  const wanted = query.query.trim().toLowerCase();

  const matched = wanted
    ? candidates.filter((c) => matches(c, wanted))
    : candidates;

  // An unmatched search is still better answered with everything than with nothing:
  // an empty inline list looks like the bot is broken.
  const chosen = (matched.length > 0 ? matched : candidates).slice(0, MAX_RESULTS);

  return {
    inline_query_id: query.id,
    results: chosen.map(toResult),
    cache_time: INLINE_CACHE_SECONDS,
    is_personal: false,
    button: ctx.miniAppUrl
      ? { text: "Open the league", web_app: { url: ctx.miniAppUrl } }
      : undefined,
  };
}

function matches(candidate: Candidate, wanted: string): boolean {
  return candidate.keywords.some(
    (keyword) => keyword.startsWith(wanted) || wanted.startsWith(keyword),
  );
}

function toResult(candidate: Candidate): InlineQueryResultArticle {
  return {
    type: "article",
    id: candidate.id,
    title: candidate.title,
    description: candidate.description,
    input_message_content: {
      message_text: candidate.text(),
      parse_mode: "HTML",
      // The table is long; a link preview underneath it would push it off screen.
      link_preview_options: { is_disabled: true },
    },
  };
}

function candidatesFor(ctx: InlineContext): Candidate[] {
  const table = ratingTable(ctx.seasonRows, 10);
  const boards = allLeaderboards(ctx.seasonRows, 3);
  const leader = table[0];
  const topScorer = boards.find((b) => b.key === "goldenBoot")?.entries[0];

  return [
    {
      id: "table",
      title: "📊 The table",
      description: leader
        ? `${leader.emoji} ${leader.displayName} leads on ${leader.rating.toFixed(1)}`
        : "Nobody has played yet",
      keywords: ["table", "league", "standings", "rating", "ratings"],
      text: () => tableMessage(table, ctx.seasonName),
    },
    {
      id: "leaders",
      title: "🏆 Leaderboards",
      description: topScorer
        ? `Golden Boot: ${topScorer.emoji} ${topScorer.displayName}, ${topScorer.value}`
        : "Golden Boot, Nutmeg King and the rest",
      keywords: ["leaders", "boards", "leaderboards", "golden", "boot", "nutmeg", "scorers"],
      text: () => leaderboardMessage(boards),
    },
    {
      id: "records",
      title: "🏛 Hall of fame",
      description: "All-time records, never reset",
      keywords: ["records", "hall", "fame", "history", "best"],
      text: () =>
        recordsMessage(
          hallOfFame(ctx.fixtureRows, ctx.careerRows),
          longestStreak(ctx.streaks.fixtureIdsOldestFirst, ctx.streaks.byPlayer),
        ),
    },
  ];
}

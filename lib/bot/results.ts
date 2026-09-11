import type { Leaderboard, TableRow } from "@/domain/leaderboards";
import { formStrip, type FormSummary } from "@/domain/leaderboards";
import type { HallOfFame, RecordHolder, StreakRecord } from "@/domain/records";
import type { CardAttributes } from "@/domain/rating";
import type { MatchFormat } from "@/domain/formats";
import { describeScore } from "@/domain/scoring";
import type { PlayerSettlement, Settlement } from "@/domain/settle";
import { describeKickoff } from "@/domain/schedule";
import type { Side } from "@/domain/types";
import { bold, escapeHtml, italic, playerLabel, plural, sentenceList } from "./format";
import { statGrid, statSummary } from "./stats";

/**
 * How the fantasy layer talks.
 *
 * The tone is the product here. This is a kickabout between friends, so the results
 * post is written to be read out loud and laughed at, never to look like a spreadsheet
 * — the numbers are all self-reported anyway, and pretending otherwise would be the
 * fastest way to make people stop filing them.
 *
 * One rule holds throughout: nothing is invented. If nobody reported a score there is
 * no score, and the message says so rather than guessing.
 */

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * How many "so-and-so unlocked X" lines the match report will print.
 *
 * There is a real ceiling on this: a week where a milestone lands for everybody — the
 * first time the whole squad reaches five games running, say — produced eleven lines
 * in testing and buried the football under a wall of badges. The rest are still
 * earned and still on the cards; they just do not all get read out.
 */
const BADGE_LINES_SHOWN = 5;

/**
 * The most badges one person's line will name before it is trimmed, so a single
 * bumper night cannot push everyone else out of the message.
 */
const BADGES_PER_PLAYER = 3;

function medal(rank: number): string {
  return MEDALS[rank - 1] ?? `${rank}.`;
}

function signed(value: number): string {
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

export interface BadgeDetails {
  name: string;
  emoji: string;
  /** From the catalogue. Decides which badges survive the trim. */
  tier?: string;
}

export interface ResultsContext {
  kickoffAt: Date;
  teamNames: Record<Side, string>;
  /** Badge display details, keyed by code. */
  badgeNames: ReadonlyMap<string, BadgeDetails>;
}

const TIER_RANK: Record<string, number> = { legendary: 3, gold: 2, silver: 1, bronze: 0 };

function tierRank(details: BadgeDetails | undefined): number {
  return TIER_RANK[details?.tier ?? "bronze"] ?? 0;
}

export function matchReportMessage(settlement: Settlement, ctx: ResultsContext): string {
  const lines: string[] = [];

  lines.push(`📋 ${bold("Full time")} · ${escapeHtml(describeKickoff(ctx.kickoffAt))}`);
  lines.push("");
  lines.push(escapeHtml(scoreHeadline(settlement, ctx.teamNames)));

  if (settlement.reportedCount === 0) {
    lines.push("");
    lines.push(italic("Nobody filed a report, so tonight is going down as a rumour."));
    return lines.join("\n");
  }

  if (settlement.motm.length > 0) {
    lines.push("");
    const names = settlement.motm.map((m) => `${m.emoji} ${escapeHtml(m.displayName)}`);
    const votes = settlement.motm[0]?.votes ?? 0;
    lines.push(
      settlement.motm.length === 1
        ? `⭐ ${bold("Man of the match")}: ${names[0]} (${plural(votes, "vote")})`
        : `⭐ ${bold("Shared man of the match")}: ${sentenceList(names)} (${plural(votes, "vote")} each)`,
    );
  }

  if (settlement.teamOfTheWeek.length > 0) {
    lines.push("");
    lines.push(`🏆 ${bold("Team of the week")}`);
    settlement.teamOfTheWeek.forEach((player, index) => {
      lines.push(`${medal(index + 1)} ${playerLabel(player)} — ${statLine(player)}`);
    });
  }

  const movers = biggestMovers(settlement.players);
  if (movers.length > 0) {
    lines.push("");
    lines.push(`📈 ${bold("Rating")}`);
    for (const player of movers) {
      lines.push(`${playerLabel(player)} ${signed(player.rating.delta)} → ${player.rating.after.toFixed(1)}`);
    }
  }

  const badges = badgeLines(settlement, ctx.badgeNames);
  if (badges.length > 0) {
    lines.push("");
    lines.push(`🎖 ${bold("Unlocked")}`);
    lines.push(...badges.slice(0, BADGE_LINES_SHOWN));

    const hidden = badges.length - BADGE_LINES_SHOWN;
    if (hidden > 0) {
      lines.push(italic(`…and ${plural(hidden, "other")} picked something up.`));
    }
  }

  const missing = settlement.players.length - settlement.reportedCount;
  if (missing > 0) {
    lines.push("");
    lines.push(
      italic(
        `${plural(missing, "person", "people")} never answered, so their night is a blank. Fill it in next week.`,
      ),
    );
  }

  return lines.join("\n");
}

/**
 * The scoreline, said the way it deserves to be said.
 *
 * A score the players agreed tonight gets the full treatment, including how close the
 * agreement was. A score merely on record — a fixture replayed out of history — gets
 * stated flatly, because claiming a consensus that was never taken would be a lie
 * about the one number everybody cares about.
 */
export function scoreHeadline(settlement: Settlement, names: Record<Side, string>): string {
  if (settlement.scoreSource === "reports") {
    return describeScore(settlement.consensus, names);
  }

  const score = settlement.score;
  if (!score) return describeScore(settlement.consensus, names);

  const { a, b } = score;
  if (a === b) return `${names.a} ${a}-${b} ${names.b}. Honours even.`;
  return a > b ? `${names.a} ${a}-${b} ${names.b}.` : `${names.b} ${b}-${a} ${names.a}.`;
}

/** The line under a name in the team of the week — only what actually happened. */
function statLine(player: PlayerSettlement): string {
  const summary = statSummary(player.stats);
  const points = `${player.points.toFixed(1)} pts`;

  return summary ? `${summary} · ${points}` : points;
}

/**
 * Two up and one down. Naming the biggest faller is the sort of thing that only works
 * between friends, and one is enough for the joke without turning into a pile-on.
 */
export function biggestMovers(players: PlayerSettlement[], up = 2, down = 1): PlayerSettlement[] {
  const sorted = [...players].sort(
    (a, b) => b.rating.delta - a.rating.delta || a.displayName.localeCompare(b.displayName),
  );

  const risers = sorted.filter((p) => p.rating.delta > 0).slice(0, up);
  const fallers = sorted
    .filter((p) => p.rating.delta < 0)
    .slice(-down)
    .filter((p) => !risers.includes(p));

  return [...risers, ...fallers];
}

function badgeLines(settlement: Settlement, names: ReadonlyMap<string, BadgeDetails>): string[] {
  return (
    settlement.players
      .filter((p) => p.badges.length > 0)
      // Most badges first, so the trim above drops the routine ones rather than the
      // night's actual story.
      .sort((a, b) => b.badges.length - a.badges.length || a.displayName.localeCompare(b.displayName))
      .map((player) => {
        // Rarest first, so a trimmed line keeps the badge worth talking about rather
        // than whichever rule happens to sit earliest in the catalogue.
        const earned = [...player.badges]
          .sort((a, b) => tierRank(names.get(b)) - tierRank(names.get(a)))
          .slice(0, BADGES_PER_PLAYER)
          .map((code) => {
            const badge = names.get(code);
            return badge ? `${badge.emoji} ${escapeHtml(badge.name)}` : escapeHtml(code);
          });
        const more = player.badges.length - earned.length;
        // "more" does not take an s; passing it explicitly beats "2 mores".
        const suffix = more > 0 ? ` and ${plural(more, "more", "more")}` : "";
        return `${playerLabel(player)} — ${sentenceList(earned)}${suffix}`;
      })
  );
}

/**
 * Captions.
 *
 * A caption sits under a picture that already shows the detail, so it says the one
 * thing somebody scrolling past should still take in. It is not a shorter version of
 * the message — it is a different job.
 */
export function tableCaption(rows: TableRow[], seasonName: string): string {
  const leader = rows[0];
  if (!leader) return `📊 ${bold(seasonName)} — no games played yet.`;

  return `📊 ${bold(seasonName)} — ${playerLabel(leader)} leads on ${leader.rating.toFixed(1)}.`;
}

export function playerCardCaption(card: PlayerCardContext): string {
  if (card.appearances === 0) {
    return `${card.emoji} ${bold(card.displayName)} — no games yet. Say yes on Tuesday.`;
  }

  return `${card.emoji} ${bold(card.displayName)} — ${bold(card.rating.toFixed(1))} after ${plural(card.appearances, "game")}, ${describeTrend(card.form)}.`;
}

export function matchReportCaption(settlement: Settlement, names: Record<Side, string>): string {
  const headline = escapeHtml(scoreHeadline(settlement, names));
  if (settlement.motm.length === 0) return `📋 ${headline}`;

  const stars = settlement.motm.map((m) => `${m.emoji} ${escapeHtml(m.displayName)}`);
  return `📋 ${headline}\n⭐ ${sentenceList(stars)}`;
}

/**
 * What sits under the team sheet picture.
 *
 * The format belongs here and not only in the text version. The text version is the
 * *fallback* — it is sent when the render fails and at no other time — so a small
 * turnout announced only there would be announced to nobody. Found by driving a
 * five-person Wednesday and reading what the group was actually handed.
 */
export function teamSheetCaption(params: {
  kickoffAt: Date;
  venue: string;
  format?: MatchFormat;
}): string {
  const heading = `🎽 ${bold("Teams are up")} — ${escapeHtml(describeKickoff(params.kickoffAt))} · ${escapeHtml(params.venue)}`;

  if (!params.format || params.format.standard) return heading;

  return `${heading}\n\n${bold(params.format.label)} tonight — ${escapeHtml(params.format.blurb)}`;
}

export function tableMessage(rows: TableRow[], seasonName: string): string {
  if (rows.length === 0) {
    // Not "starts on Wednesday": the group votes on the night now, so naming one
    // here is a promise the rest of the app deliberately stopped making.
    return `📊 ${bold(seasonName)}\n\nNo games played yet. The table starts with the first game.`;
  }

  const lines = [`📊 ${bold(seasonName)}`, ""];

  for (const row of rows) {
    const record = `${row.wins}W ${row.draws}D ${row.losses}L`;
    lines.push(
      `${medal(row.rank)} ${playerLabel(row)} ${bold(row.rating.toFixed(1))} · ${record} · ${row.goals}⚽`,
    );
  }

  lines.push("");
  lines.push(italic("Rating moves with results, contribution and turning up."));
  return lines.join("\n");
}

export function leaderboardMessage(boards: Leaderboard[]): string {
  const played = boards.filter((b) => !b.empty);

  if (played.length === 0) {
    return `🏆 ${bold("Leaderboards")}\n\nNothing to show yet — play a game and file a report.`;
  }

  const lines = [`🏆 ${bold("Leaderboards")}`];

  for (const board of played) {
    lines.push("");
    lines.push(`${board.emoji} ${bold(board.title)} — ${italic(board.blurb)}`);
    for (const entry of board.entries) {
      const unit = entry.value === 1 ? board.unit : board.unitPlural;
      const detail = entry.detail ? ` ${italic(`(${entry.detail})`)}` : "";
      lines.push(`${medal(entry.rank)} ${playerLabel(entry)} — ${entry.value} ${unit}${detail}`);
    }
  }

  return lines.join("\n");
}

export interface PlayerCardContext {
  displayName: string;
  emoji: string;
  rating: number;
  appearances: number;
  attributes: CardAttributes;
  form: FormSummary;
  recentOutcomes: Parameters<typeof formStrip>[0];
  goals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
  motmVotes: number;
  badges: { emoji: string; name: string }[];
}

const ATTRIBUTE_LABELS: [keyof CardAttributes, string][] = [
  ["finishing", "FIN"],
  ["vision", "VIS"],
  ["flair", "FLA"],
  ["defending", "DEF"],
  ["keeping", "KEE"],
  ["reputation", "REP"],
];

export function playerCardMessage(card: PlayerCardContext): string {
  const lines: string[] = [];

  lines.push(`${card.emoji} ${bold(card.displayName)} · ${bold(card.rating.toFixed(1))}`);
  lines.push(italic(`${plural(card.appearances, "game")} played`));
  lines.push("");

  lines.push(
    ATTRIBUTE_LABELS.map(([key, label]) => `${label} ${card.attributes[key]}`).join("  "),
  );

  lines.push("");
  // Named, not just pictured. Two rows of three rather than one long line, because a
  // card is read on a phone and six labelled stats do not fit across one.
  lines.push(
    ...statGrid({
      goals: card.goals,
      assists: card.assists,
      nutmegs: card.nutmegs,
      tackles: card.tackles,
      saves: card.saves,
      motmVotes: card.motmVotes,
    }),
  );

  const strip = formStrip(card.recentOutcomes);
  if (strip) {
    lines.push("");
    lines.push(`Form ${strip} · ${describeTrend(card.form)}`);
  }

  if (card.badges.length > 0) {
    lines.push("");
    lines.push(card.badges.map((b) => b.emoji).join(" "));
    lines.push(italic(sentenceList(card.badges.map((b) => b.name))));
  }

  return lines.join("\n");
}

function describeTrend(form: FormSummary): string {
  if (form.games === 0) return "no history yet";
  if (form.trend === "rising") return `on the up (${signed(form.swing)})`;
  if (form.trend === "falling") return `sliding (${signed(form.swing)})`;
  return "holding steady";
}

/**
 * How many names a shared record prints before it collapses into a count.
 *
 * Records genuinely do get shared — an early season where half the squad has scored
 * exactly two in a game is normal — and listing fifteen names makes the board
 * unreadable and the record look like a floor rather than a high-water mark.
 */
const MAX_RECORD_HOLDERS = 3;

function holderList(holders: readonly RecordHolder[]): string {
  const shown = holders
    .slice(0, MAX_RECORD_HOLDERS)
    .map((h) => `${h.emoji} ${escapeHtml(h.displayName)}`);

  const hidden = holders.length - shown.length;
  if (hidden === 0) return sentenceList(shown);

  // Commas only for the named ones: sentenceList would put an "and" before the last
  // name and the tail adds a second, giving "Ann, Bob and Cat and 11 others".
  return `${shown.join(", ")} and ${plural(hidden, "other")}`;
}

export function recordsMessage(fame: HallOfFame, streak: StreakRecord | null): string {
  const hasAnything =
    fame.singleGame.length > 0 || fame.career.length > 0 || fame.matches.length > 0;

  if (!hasAnything) {
    return `🏛 ${bold("Hall of fame")}\n\nEmpty. Somebody go and do something memorable.`;
  }

  const lines = [`🏛 ${bold("Hall of fame")}`];

  if (fame.singleGame.length > 0) {
    lines.push("");
    lines.push(bold("One night only"));
    for (const record of fame.singleGame) {
      lines.push(
        `${record.emoji} ${escapeHtml(record.title)} — ${bold(String(record.value))} ${escapeHtml(record.unit)}, ${holderList(record.holders)}`,
      );
    }
  }

  if (fame.career.length > 0) {
    lines.push("");
    lines.push(bold("All time"));
    for (const record of fame.career) {
      lines.push(
        `${record.emoji} ${escapeHtml(record.title)} — ${bold(String(record.value))} ${escapeHtml(record.unit)}, ${holderList(record.holders)}`,
      );
    }
  }

  if (streak) {
    lines.push(
      `🔥 Longest run — ${bold(plural(streak.length, "game"))} in a row, ${holderList(streak.holders)}`,
    );
  }

  if (fame.matches.length > 0) {
    lines.push("");
    lines.push(bold("Nights nobody forgot"));
    for (const record of fame.matches) {
      lines.push(
        `${record.emoji} ${escapeHtml(record.title)} — ${bold(record.description)}, ${escapeHtml(describeKickoff(record.kickoffAt))}`,
      );
    }
  }

  return lines.join("\n");
}

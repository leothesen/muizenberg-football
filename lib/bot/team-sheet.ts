import type { MatchFormat } from "@/domain/formats";
import { describeKickoff } from "@/domain/schedule";
import type { PickedTeams, TeamSheet } from "@/domain/teams";
import { bold, escapeHtml, playerLabel, plural } from "./format";
import { ballLine } from "./messages";

/**
 * The team sheet.
 *
 * Two things are worth saying out loud in the message, because they are the things
 * people would otherwise argue about: how close the sides are, and why somebody is a
 * sub. Subs are the last to reply, never the weakest players, and saying so removes
 * the sting.
 */

/**
 * The dot beside each side's name.
 *
 * Unlike the rendered images, a chat message sits on whatever background Telegram is
 * using, so ⚫ and ⚪ can be literal here — the compromise the picture has to make
 * (see TEAM_COLOURS) is not needed in text.
 */
const TEAM_DOTS: Record<string, string> = {
  "kit-black": "⚫",
  "kit-white": "⚪",
  "hut-yellow": "🟡",
  "hut-blue": "🔵",
  "hut-red": "🔴",
  "hut-green": "🟢",
};

export function teamSheetMessage(params: {
  teams: PickedTeams;
  kickoffAt: Date;
  venue: string;
  /** Present when the turnout calls for something other than the usual game. */
  format?: MatchFormat;
  /** Who is bringing a ball. Absent when unknown, which says nothing either way. */
  balls?: readonly { displayName: string; emoji: string }[];
}): string {
  const lines: string[] = [];

  lines.push(`🎽 ${bold("Teams are up")}`);
  lines.push(`${describeKickoff(params.kickoffAt)} · ${escapeHtml(params.venue)}`);

  // Said at the top, not the bottom. On a thin week the first question is "is it even
  // on?", and the answer has to arrive before anybody has finished reading the names.
  if (params.format && !params.format.standard) {
    lines.push("");
    lines.push(`${bold(params.format.label)} tonight — ${escapeHtml(params.format.blurb)}`);
  }

  // No ball goes at the top too. It is match day, this is the message everybody reads,
  // and there are still hours in which somebody can dig one out of a cupboard.
  if (params.balls && params.balls.length === 0) {
    lines.push("");
    lines.push(`⚠️ ${ballLine(params.balls)}`);
  }

  lines.push("");

  for (const side of [params.teams.a, params.teams.b]) {
    lines.push(...renderSide(side));
    lines.push("");
  }

  const sizeA = params.teams.a.starters.length + params.teams.a.subs.length;
  const sizeB = params.teams.b.starters.length + params.teams.b.subs.length;
  if (sizeA !== sizeB) {
    lines.push(`<i>Uneven numbers tonight — ${sizeA} against ${sizeB}. Rotate someone through.</i>`);
  }

  const subCount = params.teams.a.subs.length + params.teams.b.subs.length;
  if (subCount > 0) {
    lines.push(
      `<i>Subs are whoever answered last, not whoever is worst. Reply early next week.</i>`,
    );
  }

  if (params.balls && params.balls.length > 0) {
    lines.push(ballLine(params.balls));
  }

  return lines.join("\n");
}

/**
 * Somebody said yes after the sides went up.
 *
 * One line under the sheet rather than a new sheet: everybody else is where they were,
 * and the only people who need to read it are the newcomer and whoever is on their
 * side. The numbers are there because a late joiner is how a side ends up a player up.
 */
export function lateJoinMessage(params: {
  player: { displayName: string; emoji: string };
  team: { name: string; colour: string };
  isSub: boolean;
  /** Sizes after they have joined, their side first. */
  sizes: { theirs: number; other: number };
}): string {
  const dot = TEAM_DOTS[params.team.colour] ?? "⚪";
  const role = params.isSub ? " as a sub" : "";
  return `➕ ${playerLabel(params.player)} joins ${dot} ${bold(params.team.name)}${role} — ${params.sizes.theirs} v ${params.sizes.other} now.`;
}

function renderSide(side: TeamSheet): string[] {
  const dot = TEAM_DOTS[side.colour] ?? "⚪";
  const lines = [`${dot} ${bold(side.name)}`];

  for (const player of side.starters) {
    lines.push(playerLabel(player));
  }

  if (side.subs.length > 0) {
    lines.push(`<i>Subs:</i> ${side.subs.map(playerLabel).join("  ")}`);
  }

  return lines;
}

/*
 * There used to be a balance note here — "Dead even on paper. No excuses." and three
 * siblings, printed under the sides and on the rendered sheet.
 *
 * It is gone because it was commentary nobody asked for on the one message people
 * open to find their own name, and because the number behind it is not the kind of
 * thing a Wednesday league wants said out loud. The sides are still balanced on
 * average rating; ratingGap is still computed and still returned by the cron for
 * anybody debugging a lopsided week. It is just not announced.
 */

/**
 * When there are not even two people.
 *
 * The only turnout that cannot be made into a game, and still not a cancellation:
 * whoever did answer gets told what they can do with a ball on their own, because
 * "called off" is the message that teaches everybody else not to bother answering
 * next week.
 */
export function kickaboutMessage(params: {
  confirmed: number;
  format: MatchFormat;
  kickoffAt: Date;
}): string {
  return [
    `⚽ ${bold(params.format.label)}`,
    "",
    `${plural(params.confirmed, "person", "people")} in for ${describeKickoff(params.kickoffAt)} — not enough to pick sides.`,
    "",
    escapeHtml(params.format.blurb),
    "",
    "<i>Still on if anyone else shows up. The poll stays open.</i>",
  ].join("\n");
}


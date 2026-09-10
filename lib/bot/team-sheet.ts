import { describeKickoff } from "@/domain/schedule";
import type { PickedTeams, TeamSheet } from "@/domain/teams";
import { bold, escapeHtml, playerLabel, plural } from "./format";

/**
 * The team sheet.
 *
 * Two things are worth saying out loud in the message, because they are the things
 * people would otherwise argue about: how close the sides are, and why somebody is a
 * sub. Subs are the last to reply, never the weakest players, and saying so removes
 * the sting.
 */

const TEAM_DOTS: Record<string, string> = {
  "hut-yellow": "🟡",
  "hut-blue": "🔵",
  "hut-red": "🔴",
  "hut-green": "🟢",
};

export function teamSheetMessage(params: {
  teams: PickedTeams;
  kickoffAt: Date;
  venue: string;
}): string {
  const lines: string[] = [];

  lines.push(`🎽 ${bold("Teams are up")}`);
  lines.push(`${describeKickoff(params.kickoffAt)} · ${escapeHtml(params.venue)}`);
  lines.push("");

  for (const side of [params.teams.a, params.teams.b]) {
    lines.push(...renderSide(side));
    lines.push("");
  }

  lines.push(balanceNote(params.teams.ratingGap));

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

  return lines.join("\n");
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

/**
 * The gap is a sum of ratings across a whole team, so a couple of points is noise.
 * Say so, rather than presenting a meaningless number as precision.
 */
function balanceNote(gap: number): string {
  if (gap < 0.5) return "⚖️ Dead even on paper. No excuses.";
  if (gap < 2) return `⚖️ ${gap.toFixed(1)} a player between them — as close as it gets.`;
  if (gap < 5) return `⚖️ ${gap.toFixed(1)} a player in it. Slight edge, nothing more.`;
  return `⚖️ ${gap.toFixed(1)} a player apart. Someone owes the other lot a head start.`;
}

/** Short version for a fixture that fell over. */
export function notEnoughPlayersMessage(params: {
  confirmed: number;
  needed: number;
  kickoffAt: Date;
}): string {
  return [
    `😞 ${bold("Called off")}`,
    "",
    `Only ${plural(params.confirmed, "person", "people")} in for ${describeKickoff(params.kickoffAt)}, and we need ${params.needed}.`,
    "",
    "Next Wednesday. Answer the poll early and this does not happen.",
  ].join("\n");
}


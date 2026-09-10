import { relativeKickoff } from "@/domain/schedule";
import type { SquadHealth } from "@/domain/squad";
import { escapeHtml } from "./format";

/**
 * Chasing the people who have not answered.
 *
 * Two rules keep this from becoming nagging. It only goes out when the game is
 * actually short of players — nobody needs a reminder about a match that is already
 * full — and it never goes to somebody who has already said no.
 */

export function shouldNudge(health: SquadHealth): boolean {
  return !health.full && (!health.viable || health.spotsLeft > 4);
}

export function nudgeMessage(params: {
  firstName: string;
  kickoffAt: Date;
  now: Date;
  health: SquadHealth;
}): string {
  const name = escapeHtml(params.firstName);
  const when = relativeKickoff(params.kickoffAt, params.now);

  if (!params.health.viable) {
    const short = params.health.shortBy;
    return [
      `⚽ ${name} — football ${when} and we're ${short} short.`,
      "",
      "It falls over without you. One tap either way.",
    ].join("\n");
  }

  return [
    `⚽ ${name} — football ${when}. Still ${params.health.spotsLeft} spots going.`,
    "",
    "You haven't said either way yet.",
  ].join("\n");
}

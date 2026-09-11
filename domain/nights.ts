import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { LEAGUE_TIMEZONE, DEFAULT_SCHEDULE } from "./schedule";

/**
 * Which night this week.
 *
 * The league's night is not actually fixed. The WhatsApp group it came from says
 * Thursday evenings and ad hoc Sundays; in practice it has been landing on a
 * Wednesday. Encoding one weekday and calling it the truth is how the bot ends up
 * confidently announcing a game on a night nobody is going to.
 *
 * So the group is asked, and the group decides. Two rules keep that from making
 * things worse than a fixed night ever was:
 *
 *  1. Every vote has a default, and the default is always that the game happens. A
 *     poll nobody answers is the commonest outcome in a group of 38, and it has to
 *     resolve to "the usual night" rather than to silence — silence is precisely the
 *     dead week this is meant to prevent.
 *
 *  2. Nobody has to pick one. People can do Wednesday *or* Thursday, and a
 *     single-choice poll would split that answer in half and produce a worse night
 *     than either. Votes are per-night and a person casts as many as they like.
 */

export interface NightOption {
  /** Stored in the vote row and packed into the callback payload. Keep it short. */
  key: string;
  /** 0 is Sunday, matching Date#getDay. */
  weekday: number;
  label: string;
  /** Wall-clock kickoff in league time. */
  hour: number;
  minute: number;
  /** Weekend games are a second, optional fixture rather than the main one. */
  weekend: boolean;
}

/**
 * The nights on offer.
 *
 * Five, not seven. Monday and Friday have never been played and putting them on the
 * keyboard would spread a small group thinner for no reason; if somebody wants a
 * Monday they can call one directly rather than vote for it.
 *
 * Weekend kickoffs are earlier because a Saturday game is not an after-work game.
 * That time is a guess and is meant to be corrected once somebody has played one.
 */
export const NIGHT_OPTIONS: readonly NightOption[] = [
  { key: "tue", weekday: 2, label: "Tuesday", hour: 17, minute: 30, weekend: false },
  { key: "wed", weekday: 3, label: "Wednesday", hour: 17, minute: 30, weekend: false },
  { key: "thu", weekday: 4, label: "Thursday", hour: 17, minute: 30, weekend: false },
  { key: "sat", weekday: 6, label: "Saturday", hour: 17, minute: 0, weekend: true },
  { key: "sun", weekday: 0, label: "Sunday", hour: 17, minute: 0, weekend: true },
] as const;

/**
 * How many people have to want a weekend game before one is booked.
 *
 * Six, because that is a real 3 v 3 rather than a token gesture, and because a second
 * fixture that nobody turns up to costs more than it gains: it splits the week's
 * turnout and teaches people that the bot books games that do not happen. The
 * weeknight has no threshold at all — that one happens regardless.
 */
export const WEEKEND_THRESHOLD = 6;

export function nightByKey(key: string): NightOption | null {
  return NIGHT_OPTIONS.find((option) => option.key === key) ?? null;
}

/**
 * The night the league falls back to when nobody has said anything yet.
 *
 * Only used before there is any history to read. Once a game has been played,
 * `weeknightOf` on the last one is a better answer than any constant — see
 * resolveNights.
 */
export function usualNight(): NightOption {
  return (
    NIGHT_OPTIONS.find((option) => option.weekday === DEFAULT_SCHEDULE.weekday) ??
    NIGHT_OPTIONS[1]!
  );
}

/** The night a kickoff falls on, if it is one the group votes between. */
export function weeknightOf(kickoffAt: Date): NightOption | null {
  const local = toZonedTime(kickoffAt, LEAGUE_TIMEZONE);
  return (
    NIGHT_OPTIONS.find(
      (option) => !option.weekend && option.weekday === local.getDay(),
    ) ?? null
  );
}

/**
 * The default the next poll falls back to: the night the group last actually played.
 *
 * A constant would be wrong the moment the group drifts, which is exactly what
 * happened before any of this existed — the code said Wednesday, the group's own
 * description said Thursday, and the games were landing on a Wednesday with nobody
 * having decided that. Reading the last weeknight means the default follows the real
 * habit and corrects itself, so a quiet week repeats what the group is already doing
 * rather than what somebody typed once.
 *
 * Weekend fixtures are skipped: a Saturday game does not make Saturday the league
 * night, it makes it a Saturday game.
 */
export function defaultNightFrom(recentKickoffs: readonly Date[]): NightOption {
  for (const kickoff of recentKickoffs) {
    const night = weeknightOf(kickoff);
    if (night) return night;
  }
  return usualNight();
}

export interface NightTally {
  option: NightOption;
  votes: number;
}

/** Votes per night, in the order the keyboard shows them. */
export function tallyNights(votes: readonly { night: string }[]): NightTally[] {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    counts.set(vote.night, (counts.get(vote.night) ?? 0) + 1);
  }

  return NIGHT_OPTIONS.map((option) => ({
    option,
    votes: counts.get(option.key) ?? 0,
  }));
}

export interface NightOutcome {
  /** The game. There is always one. */
  weeknight: NightOption;
  /** A second game, only when enough people actually asked for it. */
  weekend: NightOption | null;
  /** True when nobody voted and the usual night carried it by default. */
  byDefault: boolean;
  tally: NightTally[];
}

/**
 * Read the votes.
 *
 * A tie among weeknights goes to the fallback night if it is one of the tied, and
 * otherwise to the earliest tied night — earlier is better than later, because a
 * game on Tuesday that half the group misses can still be followed by somebody
 * calling another one, and a game on Thursday cannot.
 *
 * `fallback` is normally the night the group last played rather than a constant, so
 * a poll nobody answers repeats what the group is already doing. See
 * defaultNightFrom.
 */
export function resolveNights(
  votes: readonly { night: string }[],
  fallback: NightOption = usualNight(),
): NightOutcome {
  const tally = tallyNights(votes);
  const usual = fallback;

  const weeknights = tally.filter((entry) => !entry.option.weekend);
  const best = Math.max(...weeknights.map((entry) => entry.votes));

  if (best === 0) {
    // Nobody said anything. The game still happens — this is the whole point.
    return { weeknight: usual, weekend: null, byDefault: true, tally };
  }

  const tied = weeknights.filter((entry) => entry.votes === best);
  const weeknight =
    tied.find((entry) => entry.option.key === usual.key)?.option ?? tied[0]!.option;

  const weekendEntries = tally
    .filter((entry) => entry.option.weekend && entry.votes >= WEEKEND_THRESHOLD)
    .sort((a, b) => b.votes - a.votes);

  return {
    weeknight,
    weekend: weekendEntries[0]?.option ?? null,
    byDefault: false,
    tally,
  };
}

/**
 * The next kickoff falling on this night, strictly after `now`.
 *
 * Deliberately not reusing nextKickoff: that one answers "when is the league's night"
 * from a fixed config, and this one answers "when is the night the group just chose",
 * which is a different question with a different failure mode. Same timezone
 * arithmetic though — wall clock first, absolute instant last, so a server in any
 * region agrees which Thursday is meant.
 */
export function kickoffOn(option: NightOption, now: Date): Date {
  const local = toZonedTime(now, LEAGUE_TIMEZONE);

  const atTime = new Date(local);
  atTime.setHours(option.hour, option.minute, 0, 0);

  const daysAhead = (option.weekday - atTime.getDay() + 7) % 7;
  atTime.setDate(atTime.getDate() + daysAhead);

  const candidate = fromZonedTime(atTime, LEAGUE_TIMEZONE);
  if (candidate.getTime() > now.getTime()) return candidate;

  const nextWeek = new Date(atTime);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return fromZonedTime(nextWeek, LEAGUE_TIMEZONE);
}

/**
 * The Monday of the week a moment falls in, as a plain date.
 *
 * Scopes a poll to a week without needing a poll entity of its own: two votes with
 * the same week_start are votes in the same poll, and next Monday starts a new one
 * automatically. Sunday belongs to the week that has just finished, which matters
 * because a Sunday game is voted for on the Monday six days earlier.
 */
export function weekStart(now: Date): string {
  const local = toZonedTime(now, LEAGUE_TIMEZONE);
  const offset = (local.getDay() + 6) % 7;

  const monday = new Date(local);
  monday.setDate(monday.getDate() - offset);

  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const day = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

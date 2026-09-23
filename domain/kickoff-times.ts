import { toZonedTime } from "date-fns-tz";
import { sunsetOn } from "./daylight";
import { kickoffOn, type NightOption } from "./nights";
import { DEFAULT_SCHEDULE, LEAGUE_TIMEZONE } from "./schedule";

/**
 * What time this week.
 *
 * The weeknight game kicks off at 17:30 and has for as long as the league has existed,
 * because that is when it is still light in winter and people can get there from work.
 * In summer the sun sets past eight, and a later start is both possible and, for
 * anybody coming from further than Muizenberg, easier. So the Monday poll asks what
 * time as well as which night.
 *
 * The rules mirror the night vote, for the same reasons:
 *
 *  1. The default is 17:30 and silence keeps it. A poll nobody answers must still
 *     produce a game at a time everybody already knows.
 *
 *  2. People tap every time they could make, not one.
 *
 * And one rule the night vote does not need: moving the time takes a few people, not
 * one. Everybody who is happy with 17:30 has every reason to say nothing, so a single
 * tap on 19:00 would otherwise move the whole group's evening on the strength of one
 * person's commute.
 */

export interface KickoffTime {
  /** "1830". Stored in the vote row and packed into the callback payload. */
  key: string;
  hour: number;
  minute: number;
  /** "18:30", as the chat shows it. */
  label: string;
}

function time(hour: number, minute: number): KickoffTime {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return { key: `${hh}${mm}`, hour, minute, label: `${hh}:${mm}` };
}

/** The usual kickoff, and the one every quiet week falls back to. */
export const DEFAULT_KICKOFF_TIME: KickoffTime = time(
  DEFAULT_SCHEDULE.hour,
  DEFAULT_SCHEDULE.minute,
);

/**
 * Every time the poll can offer, earliest first.
 *
 * Half hours from the default to 19:00. Nothing later, because even at midsummer a
 * 19:30 start does not finish in daylight; nothing earlier, because nobody has asked
 * for an earlier game and a 17:00 start is before most people finish work.
 */
export const KICKOFF_TIMES: readonly KickoffTime[] = [
  DEFAULT_KICKOFF_TIME,
  time(18, 0),
  time(18, 30),
  time(19, 0),
];

/** How long a game runs. The questionnaire goes out an hour after kickoff for the same reason. */
export const GAME_MINUTES = 60;

/**
 * Usable light after the sun has gone.
 *
 * Civil twilight in Cape Town lasts around twenty-five minutes, and a ball is still
 * easy to see for most of it. Twenty is a guess to be corrected by somebody who has
 * actually played in it.
 */
export const LAST_LIGHT_MINUTES = 20;

/**
 * Votes a later time needs before it replaces 17:30. It also has to beat 17:30's own
 * count. See the note at the top of the file for why one vote is not enough.
 */
export const TIME_CHANGE_THRESHOLD = 3;

export function kickoffTimeByKey(key: string): KickoffTime | null {
  return KICKOFF_TIMES.find((option) => option.key === key) ?? null;
}

/** The kickoff time of a fixture, as one of the options if it is one. */
export function kickoffTimeOf(kickoffAt: Date): KickoffTime {
  const local = toZonedTime(kickoffAt, LEAGUE_TIMEZONE);
  return time(local.getHours(), local.getMinutes());
}

/**
 * Whether a game starting at this time on this day finishes while it is still light.
 *
 * `day` is any instant on the league-local day the game would be played.
 */
export function finishesInDaylight(option: KickoffTime, day: Date): boolean {
  const sunset = toZonedTime(sunsetOn(day), LEAGUE_TIMEZONE);
  const lastLight = sunset.getHours() * 60 + sunset.getMinutes() + LAST_LIGHT_MINUTES;
  return option.hour * 60 + option.minute + GAME_MINUTES <= lastLight;
}

/**
 * The times worth offering for a game on this day.
 *
 * The default is always on the list. In June the sun is down before a 17:30 game
 * ends, and the league plays it anyway; the bot is not going to be the thing that
 * tells a winter group it has no time at all. Only the later times are held to the
 * daylight rule, and in midwinter that leaves 17:30 on its own — at which point the
 * poll stops asking.
 */
export function timesOnOffer(day: Date): KickoffTime[] {
  return KICKOFF_TIMES.filter(
    (option) => option.key === DEFAULT_KICKOFF_TIME.key || finishesInDaylight(option, day),
  );
}

export interface TimeTally {
  option: KickoffTime;
  votes: number;
}

export interface TimeOutcome {
  time: KickoffTime;
  /** True when 17:30 stands because nothing else has earned enough votes. */
  byDefault: boolean;
  /** Votes per time on offer, earliest first. */
  tally: TimeTally[];
}

/**
 * Read the time votes.
 *
 * The time with the most votes wins, as long as it clears TIME_CHANGE_THRESHOLD and
 * beats 17:30 outright. A tie between two later times goes to the earlier one: more
 * light, and closer to what people already planned their evening around.
 *
 * Votes for a time no longer on offer are ignored. That only happens when a vote was
 * cast for a different night than the one now winning, and sunset moves so little
 * across one week that it is almost never going to.
 */
export function resolveTime(
  votes: readonly { time: string }[],
  offered: readonly KickoffTime[] = KICKOFF_TIMES,
): TimeOutcome {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    counts.set(vote.time, (counts.get(vote.time) ?? 0) + 1);
  }

  const tally = offered.map((option) => ({ option, votes: counts.get(option.key) ?? 0 }));
  const usual = counts.get(DEFAULT_KICKOFF_TIME.key) ?? 0;

  // Earliest first, so the first of the highest is the earliest of any tie.
  let best: TimeTally | null = null;
  for (const entry of tally) {
    if (entry.option.key === DEFAULT_KICKOFF_TIME.key) continue;
    if (!best || entry.votes > best.votes) best = entry;
  }

  if (best && best.votes >= TIME_CHANGE_THRESHOLD && best.votes > usual) {
    return { time: best.option, byDefault: false, tally };
  }

  return { time: DEFAULT_KICKOFF_TIME, byDefault: true, tally };
}

/** "18:42", the sunset line under the time buttons. */
export function sunsetLabel(day: Date): string {
  const local = toZonedTime(sunsetOn(day), LEAGUE_TIMEZONE);
  return `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
}

export interface TimeVote {
  outcome: TimeOutcome;
  /** Sunset on the night currently winning, "18:42". */
  sunset: string;
}

/**
 * The time vote as it stands, for the night that is currently winning.
 *
 * Which times are on offer depends on the night, because it depends on sunset — so
 * this is read after the nights, not beside them.
 */
export function readTimeVote(
  weeknight: NightOption,
  votes: readonly { time: string }[],
  now: Date,
): TimeVote {
  const day = kickoffOn(weeknight, now);
  return { outcome: resolveTime(votes, timesOnOffer(day)), sunset: sunsetLabel(day) };
}

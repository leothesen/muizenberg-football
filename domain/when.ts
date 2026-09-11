import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { LEAGUE_TIMEZONE } from "./schedule";

/**
 * Reading a kickoff out of what somebody typed.
 *
 * For games nobody voted on — the ad hoc Sunday the group already plays and the app
 * had no concept of. The input is a person in a chat with one hand on their phone, so
 * this takes "saturday", "sat 4pm", "tomorrow 6pm" and "thursday 18:30" and refuses
 * anything it is not sure about, because booking a game at the wrong time is worse
 * than asking again.
 *
 * Deliberately not a general date parser. No "next Tuesday week", no month names, no
 * "in three days". Every format here is one somebody would actually thumb out while
 * standing up, and the failure mode of a clever parser is a fixture on a date nobody
 * meant.
 */

const DAY_WORDS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  weds: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/**
 * When a game starts if nobody says.
 *
 * 17:30 on a weeknight, because that is what the group actually plays and because
 * 18:00 is losing the light by the time anybody has warmed up. Weekend games start
 * earlier still — a Saturday is not an after-work game.
 */
const WEEKNIGHT_KICKOFF = { hour: 17, minute: 30 };
const WEEKEND_KICKOFF = { hour: 17, minute: 0 };

interface TimeOfDay {
  hour: number;
  minute: number;
}

/**
 * "6pm", "18:00", "6.30pm", "1830".
 *
 * A bare number under 24 is read as an hour on the 24-hour clock unless am or pm says
 * otherwise, so "18" means six in the evening and "6" means six in the morning — which
 * is why a bare "6" is rejected below rather than guessed at.
 */
export function parseTimeOfDay(token: string): TimeOfDay | null {
  const match = token
    .toLowerCase()
    .match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?$/);

  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (minute > 59) return null;

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  // No meridiem and no minutes is ambiguous: "6" is as likely to mean six in the
  // evening as six in the morning, and a fixture at 06:00 would be noticed by nobody
  // until nobody turned up.
  if (!meridiem && !match[2] && hour < 12) return null;

  return hour <= 23 ? { hour, minute } : null;
}

export interface ParsedWhen {
  kickoffAt: Date;
  /** True when no time was given and the league's usual hour was assumed. */
  assumedTime: boolean;
}

/**
 * The next moment matching what somebody typed, always in the future.
 *
 * "Saturday" on a Saturday afternoon means next Saturday, not four hours ago — a game
 * in the past is the one answer that is certainly wrong.
 */
export function parseWhen(input: string, now: Date): ParsedWhen | null {
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let day: number | null = null;
  let relativeDays: number | null = null;
  let time: TimeOfDay | null = null;

  for (const token of tokens) {
    const cleaned = token.replace(/[.,]$/, "");

    if (cleaned === "today" || cleaned === "tonight") {
      relativeDays = 0;
      continue;
    }
    if (cleaned === "tomorrow" || cleaned === "tmrw") {
      relativeDays = 1;
      continue;
    }
    if (cleaned === "at" || cleaned === "on" || cleaned === "this" || cleaned === "next") {
      continue;
    }

    const weekday = DAY_WORDS[cleaned];
    if (weekday !== undefined) {
      day = weekday;
      continue;
    }

    const parsedTime = parseTimeOfDay(cleaned);
    if (parsedTime) {
      time = parsedTime;
      continue;
    }

    // A word this does not understand. Refusing is better than quietly ignoring it and
    // booking something the sender did not ask for.
    return null;
  }

  if (day === null && relativeDays === null) return null;

  const local = toZonedTime(now, LEAGUE_TIMEZONE);
  const target = new Date(local);

  if (relativeDays !== null) {
    target.setDate(target.getDate() + relativeDays);
  } else {
    const ahead = (day! - target.getDay() + 7) % 7;
    target.setDate(target.getDate() + ahead);
  }

  const weekend = target.getDay() === 0 || target.getDay() === 6;
  const fallback = weekend ? WEEKEND_KICKOFF : WEEKNIGHT_KICKOFF;
  target.setHours(time?.hour ?? fallback.hour, time?.minute ?? fallback.minute, 0, 0);

  let kickoffAt = fromZonedTime(target, LEAGUE_TIMEZONE);

  if (kickoffAt.getTime() <= now.getTime()) {
    // Today's slot has gone. "Tonight" has genuinely passed and is an error; a named
    // day rolls to next week, which is what somebody saying "Saturday" on a Saturday
    // evening means.
    if (relativeDays !== null) return null;

    target.setDate(target.getDate() + 7);
    kickoffAt = fromZonedTime(target, LEAGUE_TIMEZONE);
  }

  return { kickoffAt, assumedTime: time === null };
}

import { addDays, setHours, setMilliseconds, setMinutes, setSeconds } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * When the football is, and when the bot should say something about it.
 *
 * All arithmetic happens in league-local wall-clock time and is converted back to an
 * absolute instant at the end. South Africa does not observe daylight saving, but
 * doing it properly costs nothing and means a server in any region agrees about which
 * Wednesday is next.
 */

export const LEAGUE_TIMEZONE = "Africa/Johannesburg";

export interface ScheduleConfig {
  /** 0 is Sunday. Wednesday is 3. */
  weekday: number;
  hour: number;
  minute: number;
  /** Wall-clock hour on the previous day when the bot asks who is keen. */
  rsvpOpensHour: number;
  /** Wall-clock hour on match day after which the squad is locked. */
  rsvpClosesHour: number;
  /** Hours after kickoff before players are asked how it went. */
  reportsOpenAfterHours: number;
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  weekday: 3,
  hour: 17,
  minute: 30,
  rsvpOpensHour: 16,
  rsvpClosesHour: 12,
  reportsOpenAfterHours: 2,
};

export interface FixtureSchedule {
  kickoffAt: Date;
  /** Tuesday afternoon: the bot asks the group. */
  rsvpOpensAt: Date;
  /** Match-day midday: teams get picked from whoever answered. */
  rsvpClosesAt: Date;
  /** Match night: the bot asks how it went. */
  reportsOpenAt: Date;
}

function atLocalTime(local: Date, hour: number, minute = 0): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(local, hour), minute), 0), 0);
}

/**
 * The next kickoff strictly after `now`. On a Wednesday afternoon this returns
 * tonight; a minute after kick-off it rolls to next week.
 */
export function nextKickoff(now: Date, config: ScheduleConfig = DEFAULT_SCHEDULE): Date {
  const local = toZonedTime(now, LEAGUE_TIMEZONE);
  const atTime = atLocalTime(local, config.hour, config.minute);
  const daysAhead = (config.weekday - atTime.getDay() + 7) % 7;

  const candidate = fromZonedTime(addDays(atTime, daysAhead), LEAGUE_TIMEZONE);
  if (candidate.getTime() > now.getTime()) return candidate;

  return fromZonedTime(addDays(atTime, daysAhead + 7), LEAGUE_TIMEZONE);
}

export function scheduleFor(
  kickoffAt: Date,
  config: ScheduleConfig = DEFAULT_SCHEDULE,
): FixtureSchedule {
  const localKickoff = toZonedTime(kickoffAt, LEAGUE_TIMEZONE);

  return {
    kickoffAt,
    rsvpOpensAt: fromZonedTime(
      atLocalTime(addDays(localKickoff, -1), config.rsvpOpensHour),
      LEAGUE_TIMEZONE,
    ),
    rsvpClosesAt: fromZonedTime(
      atLocalTime(localKickoff, config.rsvpClosesHour),
      LEAGUE_TIMEZONE,
    ),
    reportsOpenAt: new Date(
      kickoffAt.getTime() + config.reportsOpenAfterHours * 60 * 60 * 1000,
    ),
  };
}

export function nextFixtureSchedule(
  now: Date,
  config: ScheduleConfig = DEFAULT_SCHEDULE,
): FixtureSchedule {
  return scheduleFor(nextKickoff(now, config), config);
}

/**
 * How close to kickoff a silent player is worth a private nudge.
 *
 * Wide enough that a cron running in the morning catches an evening kickoff the same
 * day, narrow enough that it never reaches back to the day the poll went up.
 */
export const NUDGE_WINDOW_HOURS = 18;

/**
 * Whether it is yet time to ask the group who is keen.
 *
 * The crons run every day and work out for themselves whether today is the day. That
 * is not a stylistic preference: the weekday used to live in vercel.json, which made
 * the match night part of the deployment. A group that votes on which night to play
 * could not have worked at all, because by the time a vote closed the schedule was
 * already fixed in a file that only a redeploy can change.
 */
export function rsvpWindowOpen(
  kickoffAt: Date,
  now: Date,
  config: ScheduleConfig = DEFAULT_SCHEDULE,
): boolean {
  return now.getTime() >= scheduleFor(kickoffAt, config).rsvpOpensAt.getTime();
}

/** Whether a silent player should be chased privately yet. */
export function withinNudgeWindow(
  kickoffAt: Date,
  now: Date,
  windowHours = NUDGE_WINDOW_HOURS,
): boolean {
  const hours = (kickoffAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  // Past kickoff is not "very close", it is too late — and a nudge arriving after the
  // game has started is the most annoying message the bot could possibly send.
  return hours >= 0 && hours <= windowHours;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "Wednesday 10 September, 18:00" — how a human would say it in the chat. */
export function describeKickoff(kickoffAt: Date): string {
  const local = toZonedTime(kickoffAt, LEAGUE_TIMEZONE);
  const day = DAY_NAMES[local.getDay()] ?? "";
  const month = MONTH_NAMES[local.getMonth()] ?? "";
  const hh = String(local.getHours()).padStart(2, "0");
  const mm = String(local.getMinutes()).padStart(2, "0");
  return `${day} ${local.getDate()} ${month}, ${hh}:${mm}`;
}

/** "tomorrow" / "tonight" / "on Wednesday", relative to now. */
export function relativeKickoff(kickoffAt: Date, now: Date): string {
  const localKick = toZonedTime(kickoffAt, LEAGUE_TIMEZONE);
  const localNow = toZonedTime(now, LEAGUE_TIMEZONE);

  const startOfDay = (d: Date) => atLocalTime(d, 0).getTime();
  const days = Math.round(
    (startOfDay(localKick) - startOfDay(localNow)) / (24 * 60 * 60 * 1000),
  );

  if (days === 0) return "tonight";
  if (days === 1) return "tomorrow";
  if (days < 0) return "already gone";
  if (days < 7) return `on ${DAY_NAMES[localKick.getDay()]}`;
  return describeKickoff(kickoffAt);
}

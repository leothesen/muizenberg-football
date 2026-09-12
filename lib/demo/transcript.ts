import { NIGHT_OPTIONS, resolveNights } from "@/domain/nights";
import type { PickedTeams } from "@/domain/teams";
import type { Commitment, PlayerLike, SquadShape } from "@/domain/types";
import {
  nightPollKeyboard,
  nightPollMessage,
  nightVoteAcknowledgement,
  nightsResolvedMessage,
} from "@/lib/bot/night-poll";
import { rsvpKeyboard, squadMessage, type FixtureLike } from "@/lib/bot/messages";
import { teamSheetCaption } from "@/lib/bot/results";
import { statSummary } from "@/lib/bot/stats";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";

/**
 * A week in the group chat, for somebody who has not joined yet.
 *
 * Every bubble below is produced by the same functions the bot uses to talk to the
 * real group — `nightPollMessage`, `squadMessage`, `teamSheetCaption` — with made-up
 * players fed in. That is the whole point: a marketing page that paraphrases the
 * product drifts from it within a month, and this one cannot. If somebody changes the
 * wording of the squad message, this page changes with it.
 *
 * The data is invented rather than read from the database on purpose. The league
 * launches empty, so a "how it works" page built on real fixtures would be blank
 * exactly when it matters most — the week people are deciding whether to install
 * Telegram for this.
 */

/** A made-up squad. Names are ordinary so nobody reads them as real members. */
const CAST: PlayerLike[] = [
  { id: "d1", displayName: "Sipho", emoji: "⚡", rating: 78 },
  { id: "d2", displayName: "Thabo", emoji: "🚀", rating: 75.5 },
  { id: "d3", displayName: "Themba", emoji: "🔥", rating: 74 },
  { id: "d4", displayName: "Marco", emoji: "🍕", rating: 72.5 },
  { id: "d5", displayName: "Kaggy", emoji: "🐆", rating: 71 },
  { id: "d6", displayName: "Pieter", emoji: "🌵", rating: 70 },
  { id: "d7", displayName: "Jonty", emoji: "🎩", rating: 69 },
  { id: "d8", displayName: "Ndu", emoji: "🌟", rating: 68.5 },
  { id: "d9", displayName: "Yusuf", emoji: "🌊", rating: 66.5 },
  { id: "d10", displayName: "Big Dave", emoji: "🐻", rating: 66 },
  { id: "d11", displayName: "Craig", emoji: "🐢", rating: 60 },
];

const SHAPE: SquadShape = { playersPerTeam: 8, subsPerTeam: 3 };

/**
 * A Wednesday evening in the near future, pinned to a fixed date.
 *
 * Fixed rather than "next Wednesday" because every string below is rendered from it —
 * "tomorrow", "Wednesday 16 September" — and a page whose copy changes with the clock
 * cannot be tested or screenshotted.
 */
const KICKOFF = new Date("2026-09-16T15:30:00.000Z");
const DAY_BEFORE = new Date("2026-09-15T12:00:00.000Z");
const MONDAY = new Date("2026-09-14T13:00:00.000Z");

const FIXTURE: FixtureLike = {
  id: "demo",
  kickoffAt: KICKOFF,
  venue: "Zandvlei Sports Ground",
  rsvpClosesAt: new Date("2026-09-16T12:00:00.000Z"),
  shape: SHAPE,
};

function commitments(players: PlayerLike[]): Commitment[] {
  return players.map((player, index) => ({
    player,
    inSince: new Date(DAY_BEFORE.getTime() + index * 60_000),
  }));
}

/** Six people said Wednesday, four said Thursday, two the weekend. */
const NIGHT_VOTES = [
  ...Array.from({ length: 6 }, () => ({ night: "wed" })),
  ...Array.from({ length: 4 }, () => ({ night: "thu" })),
  ...Array.from({ length: 2 }, () => ({ night: "sat" })),
];

export const DEMO_TEAMS: PickedTeams = {
  a: {
    side: "a",
    name: "Black",
    colour: "kit-black",
    starters: [CAST[0]!, CAST[3]!, CAST[5]!, CAST[6]!, CAST[9]!, CAST[10]!],
    subs: [],
  },
  b: {
    side: "b",
    name: "White",
    colour: "kit-white",
    starters: [CAST[1]!, CAST[2]!, CAST[4]!, CAST[7]!, CAST[8]!],
    subs: [],
  },
  ratingGap: 0.01,
};

export const DEMO_KICKOFF = KICKOFF;
export const DEMO_VENUE = FIXTURE.venue;

/** What the match report picture shows, so the page and that image agree. */
export const DEMO_RESULT = {
  score: { a: 9, b: 8 },
  agreement: "9 of 11 agreed.",
  motm: [{ displayName: "Jonty", emoji: "🎩", votes: 5 }],
  performers: [
    { displayName: "Jonty", emoji: "🎩", goals: 3, assists: 1, nutmegs: 2, tackles: 4, points: 24.5 },
    { displayName: "Sipho", emoji: "⚡", goals: 2, assists: 2, nutmegs: 1, tackles: 3, points: 19.0 },
    { displayName: "Kaggy", emoji: "🐆", goals: 2, assists: 1, nutmegs: 3, tackles: 2, points: 17.5 },
  ],
} as const;

export interface DemoMessage {
  /** When it lands, in the words a player would use. */
  when: string;
  /**
   * Whose move this is.
   *
   * The week alternates perfectly — you, bot, you, bot, you, bot — and that is the
   * single most useful thing a newcomer can know about this league: there are three
   * taps in it and the software does the other half. Carrying it as a field means the
   * page can show it as a label instead of saying "the bot does this bit" in prose
   * beside every second bubble.
   */
  actor: "you" | "bot";
  /**
   * One short line beside the bubble, for something the bubble does not already say.
   *
   * These used to run to twenty-five words and mostly paraphrased the message they sat
   * next to — the poll says "tap every night you could play", and the note said "you
   * tap every one that works". A reader who has just read the bubble is being asked to
   * read it again in worse words.
   */
  note: string;
  text: string;
  keyboard?: InlineKeyboardMarkup;
  /** A rendered picture the bot sends with the message. */
  photo?: { src: string; alt: string };
  pinned?: boolean;
  /** A direct message rather than a group one. */
  direct?: boolean;
  /**
   * What the bot says back, privately, to whoever tapped a button here.
   *
   * Real behaviour rather than a flourish: a tap in the group gets an answer only the
   * tapper sees, which is how the chat stays a chat instead of forty acknowledgements.
   * The walkthrough shows it after a tap, because it is the one part of using this bot
   * you cannot learn from reading the group.
   */
  reply?: string;
}

export function demoTranscript(): DemoMessage[] {
  const outcome = resolveNights(NIGHT_VOTES, NIGHT_OPTIONS[1]);
  const squad = commitments(CAST);

  return [
    {
      when: "Monday afternoon",
      actor: "you",
      // Not "tap the nights that work" — the bubble says that. The thing a newcomer
      // is actually wary of is being chased, so the note answers that instead.
      note: "Ignoring it is also fine. It falls back to the night you last played.",
      text: nightPollMessage(outcome),
      keyboard: nightPollKeyboard(outcome.tally),
      reply: nightVoteAcknowledgement({
        night: "Wednesday",
        voted: true,
        votes: NIGHT_VOTES,
      }),
    },
    {
      when: "Tuesday morning",
      actor: "bot",
      note: "Booked. Nobody had to agree on anything.",
      text: nightsResolvedMessage({
        outcome,
        weeknightKickoff: KICKOFF,
        weekendKickoff: null,
      }),
    },
    {
      when: "The day before",
      actor: "you",
      // The pinning and the in-place editing are the non-obvious part: one message all
      // day rather than forty replies. That is worth the words; "tap I'm in" is not.
      note: "One pinned message, edited all day. The chat never fills with replies.",
      text: squadMessage(FIXTURE, { commitments: squad, maybes: [], outs: [] }, DAY_BEFORE),
      keyboard: rsvpKeyboard(FIXTURE.id, { full: false, locked: false }),
      pinned: true,
    },
    {
      when: "Match day, lunchtime",
      actor: "bot",
      note: "Picked on the ratings, so the sides come out even.",
      /*
        The caption, not `teamSheetMessage`. When the picture renders, the group gets
        the picture and this one line; the long text version is the *fallback* sent
        only when the render fails. Printing both here showed every name twice and
        misrepresented what the chat actually looks like.
      */
      text: teamSheetCaption({ kickoffAt: KICKOFF, venue: FIXTURE.venue }),
      photo: { src: "/api/og/demo/teams", alt: "The team sheet the bot posts" },
    },
    {
      when: "The next morning",
      actor: "you",
      note: "In private. Nobody checks a word of it — that is the deal.",
      direct: true,
      text: [
        "📋 <b>Last night</b>",
        "",
        "Nine taps. Goals first.",
        "",
        `<i>You said: ${statSummary({ goals: 3, assists: 1, nutmegs: 2, tackles: 4 })}</i>`,
      ].join("\n"),
    },
    {
      when: "The next morning",
      actor: "bot",
      note: "Ratings move. The arguing starts.",
      /*
        The shape `matchReportCaption` produces — a score line, then the stars. Written
        out rather than called, because that function takes a whole Settlement and
        fabricating one to print two lines would be more fragile than this is.
      */
      text: [
        `📋 Black ${DEMO_RESULT.score.a}-${DEMO_RESULT.score.b} White.`,
        `⭐ ${DEMO_RESULT.motm.map((m) => `${m.emoji} ${m.displayName}`).join(", ")}`,
      ].join("\n"),
      photo: { src: "/api/og/demo/match", alt: "The match report the bot posts" },
    },
  ];
}

/** The made-up squad, for the pictures the transcript points at. */
export { CAST as DEMO_CAST, MONDAY as DEMO_MONDAY };

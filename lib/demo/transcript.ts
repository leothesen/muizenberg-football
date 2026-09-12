import { describeKickoff } from "@/domain/schedule";
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
import {
  FLOW_ORDER,
  openingMessage,
  questionFor,
  type Question,
  type QuestionContext,
} from "@/lib/bot/report-flow";
import { statSummary } from "@/lib/bot/stats";
import { matchReportSize, type MatchReportImageProps } from "@/lib/og/match-report-image";
import { teamSheetSize, type TeamSheetImageProps } from "@/lib/og/team-sheet-image";
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

/**
 * The props the two demo pictures are drawn from.
 *
 * Built here, once, and imported by the image route. The page needs each picture's
 * size before it loads — a chat that grows by three hundred pixels when an image
 * lands scrolls the thing you were meant to press out from under you — and the size
 * is computed from these props. Two copies of them would agree until the day they
 * did not, and the symptom would be a picture that no longer fits its box.
 */
export function demoTeamSheetProps(): TeamSheetImageProps {
  return {
    a: {
      name: DEMO_TEAMS.a.name,
      colour: DEMO_TEAMS.a.colour,
      starters: DEMO_TEAMS.a.starters.map(({ displayName, emoji }) => ({ displayName, emoji })),
      subs: [],
    },
    b: {
      name: DEMO_TEAMS.b.name,
      colour: DEMO_TEAMS.b.colour,
      starters: DEMO_TEAMS.b.starters.map(({ displayName, emoji }) => ({ displayName, emoji })),
      subs: [],
    },
    kickoff: describeKickoff(KICKOFF),
    venue: FIXTURE.venue,
  };
}

export function demoMatchReportProps(): MatchReportImageProps {
  return {
    kickoff: describeKickoff(KICKOFF),
    teamA: { name: DEMO_TEAMS.a.name, colour: DEMO_TEAMS.a.colour },
    teamB: { name: DEMO_TEAMS.b.name, colour: DEMO_TEAMS.b.colour },
    score: { a: DEMO_RESULT.score.a, b: DEMO_RESULT.score.b },
    agreement: DEMO_RESULT.agreement,
    motm: DEMO_RESULT.motm.map((m) => ({ ...m })),
    performers: DEMO_RESULT.performers.map((p) => ({
      displayName: p.displayName,
      emoji: p.emoji,
      line: statSummary({
        goals: p.goals,
        assists: p.assists,
        nutmegs: p.nutmegs,
        tackles: p.tackles,
      }),
      points: p.points,
    })),
  };
}

/**
 * The part of a message a hint is about.
 *
 * Named parts rather than CSS selectors, so the transcript can say what it means
 * ("the keyboard") and the drawing of Telegram decides where that is on screen.
 */
export type DemoHintTarget = "keyboard" | "text" | "photo" | "badge" | "toast" | "header";

/**
 * A floating note on the tour: what a part of the message is for.
 *
 * Replaces the single line of prose that used to sit under each bubble. That line
 * could only describe the message as a whole; a note can point at the one piece it is
 * about — the buttons, the pin, the picture — which is the difference between telling
 * somebody the squad message is pinned and showing them the pin.
 */
export interface DemoHint {
  target: DemoHintTarget;
  /** What it is, or what to do. A few words. */
  title: string;
  /** Why it exists. One sentence, and never a paraphrase of the bubble. */
  body: string;
}

export interface DemoMessage {
  /** When it lands, in the words a player would use. */
  when: string;
  /**
   * Whose move this is.
   *
   * The week alternates perfectly — you, bot, you, bot, you, bot — and that is the
   * single most useful thing a newcomer can know about this league: there are three
   * taps in it and the software does the other half.
   */
  actor: "you" | "bot";
  /**
   * The floating notes for this step, most important first.
   *
   * On a step where you have something to press, the first note is about that thing.
   * Every note is about a part the message actually has — a test holds that, because a
   * note pointing at a keyboard that is not there has nowhere to point.
   */
  hints: DemoHint[];
  /**
   * The clock in the corner of the bubble.
   *
   * A literal rather than a formatted Date: it is decoration on a drawing of Telegram,
   * and the rest of this file is pinned to fixed dates precisely so the page can be
   * tested and screenshotted.
   */
  sentAt: string;
  text: string;
  keyboard?: InlineKeyboardMarkup;
  /**
   * A rendered picture the bot sends with the message, with its real pixel size so
   * the page can reserve the space before it arrives.
   */
  photo?: { src: string; alt: string; width: number; height: number };
  pinned?: boolean;
  /** A direct message rather than a group one. */
  direct?: boolean;
  /**
   * What the bot answers, privately, to whoever tapped a button here — and the note
   * that explains it.
   *
   * Real behaviour: the bot answers a tap with `answerCallbackQuery`, which Telegram
   * shows as a toast to the person who tapped and to nobody else. The page draws it as
   * that toast, not as a message. It used to be a message bubble marked "just you",
   * which is a different Telegram feature altogether.
   */
  reply?: { text: string; hint: DemoHint };
  /**
   * The post-match questionnaire, as the bot actually runs it.
   *
   * The tour used to show a single hand-written bubble reading "Nine taps. Goals
   * first." — which told somebody their stats get recorded without ever showing them
   * how. This is the real thing instead: the greeting the bot sends, then every
   * question `questionFor` builds, each with its own buttons. Tapping an answer edits
   * the message to the next question, exactly as `report-handler` does in the private
   * chat, and finishing turns it into the real "Logged" message with the numbers you
   * tapped. `text` and `keyboard` above are the first question, so the page reads
   * correctly before anybody has touched it.
   */
  questionnaire?: DemoQuestionnaire;
}

export interface DemoQuestionnaire {
  /** The first of the two DMs: a greeting, with no buttons. */
  opening: string;
  /** Every question, in the order the bot asks them. */
  questions: Question[];
  /** The note that appears once it is finished, about what happens to the answers. */
  loggedHint: DemoHint;
}

/**
 * Who the reader is, in the questionnaire.
 *
 * Pieter, because he is on a side, is not man of the match and is not one of the top
 * performers in the report that follows — so whatever the reader taps, the next
 * morning's report cannot contradict it.
 */
const YOU = CAST[5]!;

function demoQuestionnaire(): DemoQuestionnaire {
  const context: QuestionContext = {
    fixtureId: FIXTURE.id,
    firstName: YOU.displayName,
    teamName: DEMO_TEAMS.a.name,
    opponentName: DEMO_TEAMS.b.name,
    // Everybody who played except you, from both sides — as `report-services` builds it.
    peers: [...DEMO_TEAMS.a.starters, ...DEMO_TEAMS.b.starters]
      .filter((player) => player.id !== YOU.id)
      .map((player) => ({
        playerId: player.id,
        displayName: player.displayName,
        emoji: player.emoji,
      })),
  };

  const questions = FLOW_ORDER.map((state) => questionFor(state, context)).filter(
    (question): question is Question => question !== null,
  );

  return {
    opening: openingMessage(YOU.displayName),
    questions,
    loggedHint: {
      target: "text",
      title: "Added up by morning",
      // `results/settle` compares everyone's scores and builds the report from them.
      body: "Everyone's answers are compared in the morning, and the report is built from them.",
    },
  };
}

export function demoTranscript(): DemoMessage[] {
  const outcome = resolveNights(NIGHT_VOTES, NIGHT_OPTIONS[1]);
  const squad = commitments(CAST);
  const questionnaire = demoQuestionnaire();

  /*
    The clocks are the times the crons in `vercel.json` actually fire, moved from UTC
    to Cape Town: the poll at 17:00 on Monday, the booking at 09:00 Tuesday, the squad
    list at 16:00, teams at 12:00, the questionnaire at 20:00 and the report at 08:00.
  */

  return [
    {
      when: "Monday afternoon",
      actor: "you",
      sentAt: "17:00",
      hints: [
        {
          target: "keyboard",
          title: "Tap a night",
          // `toggleNightVote` — a second tap takes the vote back.
          body: "Votes pick the night, so nobody has to organise. Tap again to take one back.",
        },
        {
          target: "text",
          title: "A live count",
          // The router edits this message on every vote; with no votes at all the
          // week falls back to the night the group last played.
          body: "It edits itself as votes land. No votes? It keeps the night you last played.",
        },
      ],
      text: nightPollMessage(outcome),
      keyboard: nightPollKeyboard(outcome.tally),
      reply: {
        text: nightVoteAcknowledgement({ night: "Wednesday", voted: true, votes: NIGHT_VOTES }),
        hint: {
          target: "toast",
          title: "Only you saw this",
          body: "Taps get a private answer, so the group never fills up with confirmations.",
        },
      },
    },
    {
      when: "Tuesday morning",
      actor: "bot",
      sentAt: "09:00",
      hints: [
        {
          target: "text",
          title: "Booked for you",
          body: "The bot counts the votes and fixes the night. Nobody had to agree on anything.",
        },
      ],
      text: nightsResolvedMessage({
        outcome,
        weeknightKickoff: KICKOFF,
        weekendKickoff: null,
      }),
    },
    {
      when: "The day before",
      actor: "you",
      sentAt: "16:00",
      hints: [
        {
          target: "keyboard",
          title: "Tap I'm in",
          // `setRsvp` just overwrites your status, until the keyboard locks to
          // "Teams are picked".
          body: "Change your answer whenever you like, right up until the teams are picked.",
        },
        {
          target: "badge",
          title: "One pinned list",
          // Pinned by the rsvp/open cron; every RSVP edits it in place.
          body: "Every tap edits this one message, so the chat never fills with replies.",
        },
      ],
      text: squadMessage(FIXTURE, { commitments: squad, maybes: [], outs: [] }, DAY_BEFORE),
      keyboard: rsvpKeyboard(FIXTURE.id, { full: false, locked: false }),
      pinned: true,
    },
    {
      when: "Match day, lunchtime",
      actor: "bot",
      sentAt: "12:00",
      hints: [
        {
          target: "photo",
          title: "Even sides",
          body: "Balanced on everyone's ratings, then posted as a picture you can find yourself on.",
        },
      ],
      /*
        The caption, not `teamSheetMessage`. When the picture renders, the group gets
        the picture and this one line; the long text version is the *fallback* sent
        only when the render fails.
      */
      text: teamSheetCaption({ kickoffAt: KICKOFF, venue: FIXTURE.venue }),
      photo: {
        src: "/api/og/demo/teams",
        alt: "The team sheet the bot posts",
        ...teamSheetSize(demoTeamSheetProps()),
      },
    },
    {
      /*
        "That evening", not "the next morning": `reports/ask` runs at 18:00 UTC, which
        is 20:00 in Cape Town on the night of the game — and the greeting it sends says
        "Evening". It was labelled the next morning here, a whole night out.
      */
      when: "That evening",
      actor: "you",
      sentAt: "20:00",
      hints: [
        {
          target: "keyboard",
          title: "Tap your answers",
          body: "One question at a time, and the message edits itself. Skip whenever you like.",
        },
        {
          target: "header",
          title: "A private chat",
          body: "Just you and the bot. Nobody checks your numbers — it runs on trust.",
        },
      ],
      direct: true,
      text: questionnaire.questions[0]!.text,
      keyboard: questionnaire.questions[0]!.keyboard,
      questionnaire,
    },
    {
      when: "The next morning",
      actor: "bot",
      sentAt: "08:00",
      hints: [
        {
          target: "photo",
          title: "The report",
          body: "From everyone's answers: the score most agreed on, man of the match, who stood out.",
        },
      ],
      /*
        The shape `matchReportCaption` produces — a score line, then the stars. Written
        out rather than called, because that function takes a whole Settlement and
        fabricating one to print two lines would be more fragile than this is.
      */
      text: [
        `📋 Black ${DEMO_RESULT.score.a}-${DEMO_RESULT.score.b} White.`,
        `⭐ ${DEMO_RESULT.motm.map((m) => `${m.emoji} ${m.displayName}`).join(", ")}`,
      ].join("\n"),
      photo: {
        src: "/api/og/demo/match",
        alt: "The match report the bot posts",
        ...matchReportSize(demoMatchReportProps()),
      },
    },
  ];
}

/** The made-up squad, for the pictures the transcript points at. */
export { CAST as DEMO_CAST, MONDAY as DEMO_MONDAY };

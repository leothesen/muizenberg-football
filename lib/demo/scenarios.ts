/**
 * Weeks you can watch happen.
 *
 * The bot is almost entirely made of things that arrive on their own — a poll on a
 * Monday, a nudge on the morning of the game, a match report the next day. None of it
 * can be demonstrated by clicking around, because none of it is triggered by clicking
 * anything. Showing somebody what this product *is* previously meant either waiting a
 * week or reading the source.
 *
 * So a scenario is a scripted week: an ordered list of things that happen, each with
 * a line saying what is happening and, where it is not obvious, why it works that way.
 * The narration is the point as much as the messages are — half of these steps exist
 * to demonstrate a decision that only makes sense once you know what it is avoiding.
 *
 * Pure data. Nothing here talks to a database or a browser; the runner interprets it
 * and the page renders it, which is what lets the whole set be checked by a test that
 * runs in milliseconds.
 */

/** Everybody in the seed, by Telegram id, so a script can name people. */
export const CAST = {
  leo: 100001,
  sipho: 100002,
  bigDave: 100003,
  thabo: 100004,
  jonty: 100005,
  ruan: 100006,
  kaggy: 100007,
  marco: 100008,
  pieter: 100009,
  ndu: 100010,
  ollie: 100011,
  shaun: 100012,
  themba: 100013,
  gaz: 100014,
} as const;

/** Somebody who is not in the seed, for demonstrating a first arrival. */
export const NEWCOMER = { id: 900001, name: "Zanele", emoji: "🦋" };

export type DemoAction =
  /** Run a real cron handler, the way the clock would. */
  | { kind: "cron"; step: string }
  /**
   * Roll the week forward so the booked game is a few hours away.
   *
   * The crons are honest about time — the poll opens the day before a kickoff, teams
   * are picked once that fixture's RSVP window has closed — and a scenario compresses
   * a week into a minute. Without this the demo books a game five days out and then
   * correctly refuses to do anything else with it.
   */
  | { kind: "advance" }
  /** Move a locked fixture's kickoff into the past so the night can be settled. */
  | { kind: "play" }
  /** Somebody joins the group for the first time. */
  | { kind: "join"; user: number; name: string; emoji: string }
  /** Somebody types a command. */
  | { kind: "command"; user: number; text: string }
  /** Somebody taps a button: an RSVP, a night vote, anything with callback data. */
  | { kind: "tap"; user: number; data: string }
  /** Several people tap the same button, one after another. */
  | { kind: "tapAll"; users: number[]; data: string }
  /** Answer the questionnaire for most of the squad, so the night has a scoreline. */
  | { kind: "reportAll" }
  /**
   * Read the chat as somebody else.
   *
   * The only action the page handles itself rather than sending to the server. It is
   * here because several of the decisions in this product are about who sees what —
   * an ephemeral welcome, a private nudge, a DM full of questions — and none of that
   * is visible while you are reading the chat as the same person throughout.
   */
  | { kind: "viewAs"; user: number; name: string }
  /** Wipe the chat and start the week over. */
  | { kind: "reset" };

export interface DemoStep {
  /** The clock, as a person would say it. Not a real timestamp — a label. */
  when: string;
  /** What is happening, present tense, one line. */
  narration: string;
  /**
   * Why it works this way. Only where the behaviour would otherwise look arbitrary,
   * because a note on every step is a note nobody reads.
   */
  note?: string;
  action: DemoAction;
}

export interface Scenario {
  id: string;
  title: string;
  /** One line on the gallery card: what this week is an example of. */
  blurb: string;
  steps: DemoStep[];
}

/** The RSVP callback payload for a fixture the runner has to fill in at run time. */
export const FIXTURE_PLACEHOLDER = "{fixture}";

const RSVP_IN = `r:i:${FIXTURE_PLACEHOLDER}`;
const RSVP_OUT = `r:o:${FIXTURE_PLACEHOLDER}`;

const START_OF_WEEK: DemoStep[] = [
  {
    when: "Monday 17:00",
    narration: "The bot asks the group which night to play this week.",
    note: "Nobody sets the night. It used to be a constant in the code and a weekday in the deploy config, which meant changing it needed a redeploy — and the group's real night had already drifted away from it.",
    action: { kind: "cron", step: "nights-ask" },
  },
  {
    when: "Monday evening",
    narration: "Six people vote. Most tap more than one night.",
    note: "You pick every night you could play, not one. A single-choice poll splits 'Wednesday or Thursday' into two losing halves and picks a worse night than either.",
    action: {
      kind: "tapAll",
      users: [CAST.leo, CAST.sipho, CAST.jonty, CAST.kaggy, CAST.marco, CAST.ndu],
      data: "n:wed",
    },
  },
  {
    when: "Monday evening",
    narration: "Three of them can also do Thursday, and say so.",
    action: { kind: "tapAll", users: [CAST.leo, CAST.jonty, CAST.ndu], data: "n:thu" },
  },
  {
    when: "Tuesday 09:00",
    narration: "The votes are read and the week is booked.",
    note: "Had nobody voted at all, this would still book a game — on whatever night the group last actually played. Silence is the commonest outcome in a group of 38, and silence resolving to nothing is the dead week the whole thing exists to prevent.",
    action: { kind: "cron", step: "nights-resolve" },
  },
  {
    when: "…",
    narration: "A few days pass — the game jumps forward to tonight.",
    note: "The one bit of theatre, and the reason the date below changes. The crons are honest about time: the poll opens the day before a kickoff and teams are picked once that fixture's window has closed. Compressing a week into a minute means moving the game closer, not pretending the clock moved.",
    action: { kind: "advance" },
  },
  {
    when: "The day before",
    narration: "The poll goes up and pins itself.",
    note: "This cron runs every single day and works out for itself whether today is the day before a kickoff. That is what lets the night move without a deploy.",
    action: { kind: "cron", step: "rsvp-open" },
  },
];

const REPORT_AND_SETTLE: DemoStep[] = [
  {
    when: "Kick-off",
    narration: "The game is played.",
    note: "The only fake step here: it moves the kickoff into the past, because settlement refuses a fixture less than twelve hours old — everybody is meant to get a night to answer the questionnaire.",
    action: { kind: "play" },
  },
  {
    when: "After the whistle",
    narration: "Everyone who played gets a private message asking how it went.",
    note: "A DM, not a group message. Nine taps about your own game is a conversation nobody else wants in the chat.",
    action: { kind: "cron", step: "reports-ask" },
  },
  {
    when: "That evening",
    narration: "Most of them answer. Two never do.",
    note: "Deliberately two short. Somebody not answering is a real state the match report has to survive, and a demo where everybody replies would never show it.",
    action: { kind: "reportAll" },
  },
  {
    when: "Next morning",
    narration: "The score is agreed, ratings move, badges land, and the report goes up.",
    note: "Every number is self-reported and unverified on purpose. There is no referee on a Wednesday night, and a system that polices honesty stops being fun.",
    action: { kind: "cron", step: "results-settle" },
  },
];

export const SCENARIOS: Scenario[] = [
  {
    id: "normal-week",
    title: "An ordinary week",
    blurb: "Everything working: a vote, a full squad, teams, a result and a table.",
    steps: [
      { when: "", narration: "Starting with an empty chat.", action: { kind: "reset" } },
      ...START_OF_WEEK,
      {
        when: "The day before",
        narration: "Ten people say they're in.",
        action: {
          kind: "tapAll",
          users: [
            CAST.leo,
            CAST.sipho,
            CAST.bigDave,
            CAST.thabo,
            CAST.jonty,
            CAST.ruan,
            CAST.kaggy,
            CAST.marco,
            CAST.pieter,
            CAST.ndu,
          ],
          data: RSVP_IN,
        },
      },
      {
        when: "Match morning",
        narration: "Anyone who hasn't answered gets a private nudge.",
        note: "Only the people who said nothing, and only by DM or a message in the group that nobody else can see. The group gets three messages a week in total — the poll, the team sheet and the report. Getting muted is the thing that kills this.",
        action: { kind: "cron", step: "rsvp-nudge" },
      },
      {
        when: "Match midday",
        narration: "Teams are picked and posted.",
        note: "Balanced on average rating per player. Subs are whoever answered last, never whoever is worst — and the message says so, because that is the bit people would otherwise argue about.",
        action: { kind: "cron", step: "teams-pick" },
      },
      ...REPORT_AND_SETTLE,
    ],
  },
  {
    id: "thin-week",
    title: "Only five turn up",
    blurb: "The week that used to get cancelled. It becomes a 3 v 2 instead.",
    steps: [
      { when: "", narration: "Starting with an empty chat.", action: { kind: "reset" } },
      ...START_OF_WEEK,
      {
        when: "The day before",
        narration: "Only five people answer.",
        action: {
          kind: "tapAll",
          users: [CAST.leo, CAST.sipho, CAST.bigDave, CAST.thabo, CAST.jonty],
          data: RSVP_IN,
        },
      },
      {
        when: "Match midday",
        narration: "Five is not a failed eleven-a-side. It's a three and a two.",
        note: "This is the single most important decision in the product. Calling a game off for want of numbers punishes exactly the people who did answer, and teaches everybody that answering the poll is a gamble. The turnout decides what is played, never whether.",
        action: { kind: "cron", step: "teams-pick" },
      },
      ...REPORT_AND_SETTLE,
    ],
  },
  {
    id: "rained-off",
    title: "It rains",
    blurb: "Nobody can cancel a game. So watch what happens instead.",
    steps: [
      { when: "", narration: "Starting with an empty chat.", action: { kind: "reset" } },
      ...START_OF_WEEK,
      {
        when: "The day before",
        narration: "Six people are in.",
        action: {
          kind: "tapAll",
          users: [CAST.leo, CAST.sipho, CAST.bigDave, CAST.thabo, CAST.jonty, CAST.ruan],
          data: RSVP_IN,
        },
      },
      {
        when: "Match midday",
        narration: "Teams go up. A 3 v 3.",
        action: { kind: "cron", step: "teams-pick" },
      },
      {
        when: "Match afternoon",
        narration: "Leo looks out of the window and taps 'Weather looking bad?'",
        note: "That button only appears on the pinned poll once the teams are up — a weather button on a Tuesday would be a suggestion the game might not happen, three days before anybody can know. It is not a cancel button either: nobody here has the authority to call a game off for everybody else. It puts Leo out and asks the group.",
        action: { kind: "tap", user: CAST.leo, data: `w:${FIXTURE_PLACEHOLDER}` },
      },
      {
        when: "Match afternoon",
        narration: "Everybody else agrees and drops out.",
        action: {
          kind: "tapAll",
          users: [CAST.sipho, CAST.bigDave, CAST.thabo, CAST.jonty, CAST.ruan],
          data: RSVP_OUT,
        },
      },
      {
        when: "Match afternoon",
        narration: "The evening ends — because the people who were going to play it left.",
        note: "The only message in the bot that admits a game is not happening, and it is about people rather than a decision. Nothing in it suggests anybody should have answered differently, because next week depends on them answering at all.",
        action: { kind: "cron", step: "rsvp-nudge" },
      },
    ],
  },
  {
    id: "newcomer",
    title: "A newcomer can't see the poll",
    blurb: "Zanele joins at lunchtime. The pinned poll is invisible to her — watch her play anyway.",
    steps: [
      { when: "", narration: "Starting with an empty chat.", action: { kind: "reset" } },
      ...START_OF_WEEK,
      {
        when: "The day before",
        narration: "Eight people answer the poll.",
        action: {
          kind: "tapAll",
          users: [
            CAST.leo,
            CAST.sipho,
            CAST.bigDave,
            CAST.thabo,
            CAST.jonty,
            CAST.ruan,
            CAST.kaggy,
            CAST.marco,
          ],
          data: RSVP_IN,
        },
      },
      {
        when: "Match morning",
        narration: `${NEWCOMER.name} is added to the group, hours before kickoff.`,
        note: "Here is the problem she has, and it is invisible from the outside: a Telegram group can hide its history from new members, and most do. The poll was pinned yesterday, so she cannot see it. As far as she knows nobody has asked her anything and there is no game tonight.",
        action: {
          kind: "join",
          user: NEWCOMER.id,
          name: NEWCOMER.name,
          emoji: NEWCOMER.emoji,
        },
      },
      {
        when: "Match morning",
        narration: `Now read the chat as ${NEWCOMER.name}. This is everything she gets.`,
        note: "Her welcome is ephemeral — it sits in the group but only she can see it, so nobody who joined last year reads the explainer again. And it carries the In / Out / Maybe buttons for tonight in the very first row. That is the fix: she never has to find the pinned message.",
        action: { kind: "viewAs", user: NEWCOMER.id, name: NEWCOMER.name },
      },
      {
        when: "Match morning",
        narration: "So she taps I'm in, straight from the welcome.",
        action: { kind: "tap", user: NEWCOMER.id, data: RSVP_IN },
      },
      {
        when: "Match midday",
        narration: "And she's on the team sheet, same as everybody else.",
        note: "Nothing downstream knows she arrived late. She was counted towards the format, picked into a side, and will be asked how it went tonight like somebody who has been here a year.",
        action: { kind: "cron", step: "teams-pick" },
      },
      ...REPORT_AND_SETTLE,
    ],
  },
  {
    id: "ad-hoc",
    title: "Somebody calls a game",
    blurb: "No vote, no permission. The Sunday kickabout the app never used to know about.",
    steps: [
      { when: "", narration: "Starting with an empty chat.", action: { kind: "reset" } },
      {
        when: "Thursday",
        narration: "Big Dave fancies a game on Saturday, so he books one.",
        note: "Anyone can. The group already played ad hoc Sundays and the app had no concept of a game outside the weekly rhythm at all.",
        action: { kind: "command", user: CAST.bigDave, text: "/game saturday 4pm" },
      },
      {
        when: "Thursday",
        narration: "The poll opens immediately rather than waiting for a cron.",
        note: "A game called on Thursday for Saturday has to start collecting answers on Thursday.",
        action: {
          kind: "tapAll",
          users: [CAST.bigDave, CAST.leo, CAST.kaggy, CAST.marco, CAST.ndu, CAST.ollie],
          data: RSVP_IN,
        },
      },
      {
        when: "Friday",
        narration: "Somebody realises the usual pitch is booked, and moves it.",
        note: "Anyone can move the venue too. The person who knows the pitch is double-booked is a player with a phone, not an administrator with a form. The change is announced so a mistake is visible immediately.",
        action: {
          kind: "command",
          user: CAST.kaggy,
          text: "/where Muizenberg Beach https://maps.app.goo.gl/PHxfYophiH1wpKMu5",
        },
      },
      {
        when: "…",
        narration: "Saturday comes round.",
        action: { kind: "advance" },
      },
      {
        when: "Saturday midday",
        narration: "Teams go up for a game nobody scheduled.",
        note: "From here it is an ordinary fixture. Nothing downstream knows or cares that this one was called in a chat message rather than booked by a vote.",
        action: { kind: "cron", step: "teams-pick" },
      },
      ...REPORT_AND_SETTLE,
    ],
  },
];

export function scenarioById(id: string): Scenario | null {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

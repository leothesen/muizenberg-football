import {
  choicesFor,
  type CountField,
  type FlowPeer,
  type QuestionContext,
} from "./report-flow";

/**
 * The same questionnaire, as a form.
 *
 * The chat asks one question at a time and rewrites itself, which is right for a
 * chat: nine messages would be a wall, and a Wednesday night is not the moment to
 * fill in a form. On a screen the opposite is true — nine separate round trips to
 * answer nine questions is nine chances for a phone on patchy data to lose one, and
 * the answers are already in front of you.
 *
 * So this is the same nine questions, laid out at once, with the same values behind
 * them: the choices come from `report-flow`, so what the form accepts and what the
 * buttons accept cannot drift apart. Only the wording differs, because a page is not
 * a conversation.
 */

export interface CountQuestion {
  kind: "count";
  field: CountField;
  emoji: string;
  prompt: string;
  hint?: string;
  choices: { value: number; label: string }[];
}

export interface MotmQuestion {
  kind: "motm";
  emoji: string;
  prompt: string;
  hint?: string;
  peers: FlowPeer[];
}

export type FormQuestion = CountQuestion | MotmQuestion;

export interface ReportForm {
  fixtureId: string;
  teamName: string;
  opponentName: string;
  questions: FormQuestion[];
}

/** A side, named by the shirts — the thing you were looking down at during the game. */
function shirts(teamName: string): string {
  return `the ${teamName.toLowerCase()} shirts`;
}

function count(
  field: CountField,
  emoji: string,
  prompt: string,
  hint?: string,
): CountQuestion {
  return {
    kind: "count",
    field,
    emoji,
    prompt,
    hint,
    choices: choicesFor(field),
  };
}

export function reportForm(ctx: QuestionContext): ReportForm {
  return {
    fixtureId: ctx.fixtureId,
    teamName: ctx.teamName,
    opponentName: ctx.opponentName,
    questions: [
      count("goals", "⚽", "How many did you score?"),
      count(
        "assists",
        "🎁",
        "Any assists?",
        "A pass that led to a goal counts. Be generous with yourself.",
      ),
      count(
        "nutmegs",
        "🥜",
        "Nutmegs?",
        "Through the legs. You know if you did.",
      ),
      count(
        "tackles",
        "🧱",
        "Big tackles?",
        "The ones where you actually won the ball.",
      ),
      count(
        "saves",
        "🧤",
        "Saves?",
        "Everybody takes a turn in goal. Nothing if you never went in.",
      ),
      count(
        "scoreFor",
        "🔢",
        `How many did your team score — ${shirts(ctx.teamName)}?`,
        "Best guess is fine — everyone's answers get compared.",
      ),
      count("scoreAgainst", "🔢", `And ${shirts(ctx.opponentName)}?`),
      {
        kind: "motm",
        emoji: "⭐",
        prompt: "Who else played well?",
        hint: "One vote. Not yourself, obviously.",
        peers: ctx.peers,
      },
      count(
        "rating",
        "📈",
        "And how did you play?",
        "Out of ten. Nobody else sees this number.",
      ),
    ],
  };
}

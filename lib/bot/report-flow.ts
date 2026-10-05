import { encodeCallback, type ReportField } from "@/lib/telegram/callbacks";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";
// bold() escapes its own argument, so nothing interpolated into it may be escaped
// first — doing both renders a name containing markup as visible entity gibberish.
import { bold } from "./format";

/**
 * The post-match questionnaire.
 *
 * One question at a time, answered by tapping a number, with the message editing
 * itself in place so the whole thing occupies a single message rather than a wall of
 * chat. Nothing is typed, because nobody fills in a form on a Wednesday night.
 *
 * Every answer is self-reported and unverified. That is the design, not a gap: there
 * is no referee, and a system that tried to police honesty would stop being fun.
 */

export type FlowState =
  | "not_started"
  | "goals"
  | "headers"
  | "headedGoals"
  | "assists"
  | "nutmegs"
  | "tackles"
  | "saves"
  | "scoreFor"
  | "scoreAgainst"
  | "motm"
  | "rating"
  | "done";

/**
 * The order questions are asked in.
 *
 * The score first. It is the one answer the whole result depends on — settlement
 * agrees the score from what people reported, and without one the game "never
 * happened" — and it is the question everybody can answer in a second. Somebody who
 * taps "Skip the rest" straight after has still given the one number that counts.
 */
export const FLOW_ORDER: readonly FlowState[] = [
  "scoreFor",
  "scoreAgainst",
  "goals",
  "headers",
  "headedGoals",
  "assists",
  "nutmegs",
  "tackles",
  "saves",
  "motm",
  "rating",
  "done",
] as const;

export function firstState(): FlowState {
  return FLOW_ORDER[0]!;
}

/**
 * Follow-ups only asked when an earlier answer makes them relevant, mapped to the
 * question they follow. Somebody who scored nothing is never asked about headers.
 */
const FOLLOW_UPS: Partial<Record<FlowState, FlowState>> = {
  headers: "goals",
  headedGoals: "goals",
};

/** What was just answered, for the questions whose next step depends on it. */
export interface Answer {
  value: number;
  /** Goals they said they scored, as stored before this answer. */
  goals: number;
}

export function nextState(current: FlowState, answer?: Answer): FlowState {
  if (current === "not_started") return firstState();

  // Headers only make sense once there is a goal to have headed in. "Yes" with a
  // single goal already says how many, so the count is only asked about two or more.
  if (answer) {
    if (current === "goals" && answer.value === 0) return "assists";
    if (current === "headers" && (answer.value === 0 || answer.goals <= 1)) return "assists";
  }

  const index = FLOW_ORDER.indexOf(current);
  if (index === -1 || index >= FLOW_ORDER.length - 1) return "done";
  return FLOW_ORDER[index + 1]!;
}

export function isComplete(state: FlowState): boolean {
  return state === "done";
}

/** How far through the questionnaire somebody is, for a progress hint. */
export function progressOf(state: FlowState): { step: number; total: number } {
  // Follow-ups share the step of the question they follow, so the count is the same
  // whether or not they are asked, and never jumps by two.
  const counted = FLOW_ORDER.filter((s) => FOLLOW_UPS[s] === undefined);
  const total = counted.length - 1;
  const index = counted.indexOf(FOLLOW_UPS[state] ?? state);
  return { step: index < 0 ? 0 : Math.min(index + 1, total), total };
}

export interface FlowPeer {
  playerId: string;
  displayName: string;
  emoji: string;
}

export interface QuestionContext {
  fixtureId: string;
  firstName: string;
  teamName: string;
  opponentName: string;
  /** Everyone else who played, for the man-of-the-match vote. */
  peers: FlowPeer[];
  /** Goals they said they scored, which caps how many could have been headers. */
  goals?: number;
}

export interface Question {
  text: string;
  keyboard: InlineKeyboardMarkup;
}

/**
 * A side, named by what it was wearing.
 *
 * The sides are named after the shirts the group owns (see `domain/teams.ts`), so
 * "Black" becomes "black shirts" — which is the thing somebody is looking down at
 * while trying to remember whether they won. Asking "how many did Black score?"
 * makes them translate; this does not.
 *
 * Fixtures picked before the rename are stored as Bibs and Skins, but the
 * questionnaire only ever asks about the game just played, so it never sees one.
 */
function shirts(teamName: string): string {
  return `${teamName.toLowerCase()} shirts`;
}

function numberRow(
  field: ReportField,
  fixtureId: string,
  values: number[],
  label: (n: number) => string = String,
): InlineKeyboardMarkup["inline_keyboard"][number] {
  return values.map((value) => ({
    text: label(value),
    callback_data: encodeCallback({ kind: "report", field, value, fixtureId }),
  }));
}

function skipRow(fixtureId: string, text = "Skip the rest") {
  return [{ text, callback_data: encodeCallback({ kind: "reportSkip", fixtureId }) }];
}

export function questionFor(state: FlowState, ctx: QuestionContext): Question | null {
  const { fixtureId } = ctx;
  const progress = progressOf(state);
  const suffix = `\n\n<i>${progress.step} of ${progress.total}</i>`;

  switch (state) {
    case "goals":
      return {
        text: `⚽ ${bold("How many did you score?")}${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("goals", fixtureId, [0, 1, 2, 3]),
            numberRow("goals", fixtureId, [4, 5, 6, 7], (n) => (n === 7 ? "7+" : String(n))),
            skipRow(fixtureId),
          ],
        },
      };

    case "headers":
      return {
        text: `🦒 ${bold("Were any of those headers?")}\nHeaded goals count double.${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("headers", fixtureId, [0, 1], (n) => (n === 0 ? "No" : "Yes 🦒")),
            skipRow(fixtureId),
          ],
        },
      };

    case "headedGoals": {
      // Never more buttons than goals: a headed goal is one of the goals, not an extra.
      const most = Math.min(Math.max(ctx.goals ?? 2, 2), 7);
      const values = Array.from({ length: most }, (_, i) => i + 1);
      const label = (n: number) => (n === 7 ? "7+" : String(n));
      return {
        text: `🦒 ${bold("How many with your head?")}${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("headedGoals", fixtureId, values.slice(0, 4), label),
            ...(values.length > 4 ? [numberRow("headedGoals", fixtureId, values.slice(4), label)] : []),
            skipRow(fixtureId),
          ],
        },
      };
    }

    case "assists":
      return {
        text: `🎁 ${bold("Any assists?")}\nA pass that led to a goal counts. Be generous with yourself.${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("assists", fixtureId, [0, 1, 2, 3]),
            numberRow("assists", fixtureId, [4, 5, 6, 7], (n) => (n === 7 ? "7+" : String(n))),
            skipRow(fixtureId),
          ],
        },
      };

    case "nutmegs":
      return {
        text: `🥜 ${bold("Nutmegs?")}\nThrough the legs. You know if you did.${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("nutmegs", fixtureId, [0, 1, 2, 3]),
            numberRow("nutmegs", fixtureId, [4, 5, 6, 7], (n) => (n === 7 ? "7+" : String(n))),
            skipRow(fixtureId),
          ],
        },
      };

    case "tackles":
      return {
        text: `🧱 ${bold("Big tackles?")}\nThe ones where you actually won the ball.${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("tackles", fixtureId, [0, 1, 2, 3]),
            numberRow("tackles", fixtureId, [5, 8, 10, 15], (n) => (n === 15 ? "15+" : String(n))),
            skipRow(fixtureId),
          ],
        },
      };

    case "saves":
      return {
        text: `🧤 ${bold("Saves?")}\nEverybody takes a turn in goal. Nothing if you never went in.${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("saves", fixtureId, [0, 1, 2, 3]),
            numberRow("saves", fixtureId, [5, 8, 10, 15], (n) => (n === 15 ? "15+" : String(n))),
            skipRow(fixtureId),
          ],
        },
      };

    case "scoreFor":
      return {
        text: `🔢 ${bold(`How many goals did your team score — ${shirts(ctx.teamName)}?`)}\nBest guess is fine — everyone's answers get compared.${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("scoreFor", fixtureId, [0, 1, 2, 3, 4]),
            numberRow("scoreFor", fixtureId, [5, 6, 7, 8, 9]),
            numberRow("scoreFor", fixtureId, [10, 12, 15, 20], (n) => (n === 20 ? "20+" : String(n))),
            skipRow(fixtureId),
          ],
        },
      };

    case "scoreAgainst":
      return {
        text: `🔢 ${bold(`And the ${shirts(ctx.opponentName)}?`)}${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("scoreAgainst", fixtureId, [0, 1, 2, 3, 4]),
            numberRow("scoreAgainst", fixtureId, [5, 6, 7, 8, 9]),
            numberRow("scoreAgainst", fixtureId, [10, 12, 15, 20], (n) => (n === 20 ? "20+" : String(n))),
            skipRow(fixtureId),
          ],
        },
      };

    case "motm":
      return {
        text: `⭐ ${bold("Who else played well?")}\nOne vote. Not yourself, obviously.${suffix}`,
        keyboard: { inline_keyboard: [...peerRows(ctx.peers), skipRow(fixtureId, "Nobody stood out")] },
      };

    case "rating":
      return {
        text: `📈 ${bold("And how did you play?")}\nOut of ten. Nobody else sees this number.${suffix}`,
        keyboard: {
          inline_keyboard: [
            numberRow("rating", fixtureId, [1, 2, 3, 4, 5]),
            numberRow("rating", fixtureId, [6, 7, 8, 9, 10]),
            skipRow(fixtureId),
          ],
        },
      };

    default:
      return null;
  }
}

/**
 * Two per row. Three looked tidier but cut names short on a phone — a third of the
 * screen, less padding and the emoji, leaves room for about five letters — and a vote
 * for "Fred…" is a vote you have to guess at.
 */
function peerRows(peers: FlowPeer[]): InlineKeyboardMarkup["inline_keyboard"] {
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];
  for (let i = 0; i < peers.length; i += 2) {
    rows.push(
      peers.slice(i, i + 2).map((peer) => ({
        text: `${peer.emoji} ${peer.displayName}`,
        callback_data: encodeCallback({ kind: "reportMotm", playerId: peer.playerId }),
      })),
    );
  }
  return rows;
}

export function openingMessage(firstName: string): string {
  return [
    `👋 ${bold(`Evening ${firstName}`)} — how was that?`,
    "",
    "A few taps and you're done. It's all on trust, so be honest, or don't. Everyone will know.",
  ].join("\n");
}

export function completionMessage(params: {
  goals: number;
  headedGoals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
}): string {
  const bits: string[] = [];
  if (params.goals > 0) bits.push(`${params.goals} ⚽`);
  if (params.headedGoals > 0) bits.push(`${params.headedGoals} 🦒`);
  if (params.assists > 0) bits.push(`${params.assists} 🎁`);
  if (params.nutmegs > 0) bits.push(`${params.nutmegs} 🥜`);
  if (params.tackles > 0) bits.push(`${params.tackles} 🧱`);
  if (params.saves > 0) bits.push(`${params.saves} 🧤`);

  const line = bits.length > 0 ? bits.join("  ") : "A quiet one.";

  return [`✅ ${bold("Logged")}`, "", line, "", "<i>Table updates once everyone's in.</i>"].join("\n");
}

/**
 * Which question a given answer belongs to. Used to reject a tap on a stale keyboard:
 * Telegram leaves old buttons pressable, and without this check an out-of-order tap
 * could write to a field the flow has already moved past, or skip questions.
 *
 * Returns null for actions that are valid at any point, such as abandoning the flow.
 */
export function expectedStateFor(action: {
  kind: "report" | "reportMotm" | "reportSkip";
  field?: string;
}): FlowState | null {
  if (action.kind === "reportSkip") return null;
  if (action.kind === "reportMotm") return "motm";

  const field = action.field;
  return FLOW_ORDER.includes(field as FlowState) ? (field as FlowState) : null;
}

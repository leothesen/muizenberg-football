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
  | "assists"
  | "nutmegs"
  | "tackles"
  | "saves"
  | "scoreFor"
  | "scoreAgainst"
  | "motm"
  | "rating"
  | "done";

/** The order questions are asked in. */
export const FLOW_ORDER: readonly FlowState[] = [
  "goals",
  "assists",
  "nutmegs",
  "tackles",
  "saves",
  "scoreFor",
  "scoreAgainst",
  "motm",
  "rating",
  "done",
] as const;

export function firstState(): FlowState {
  return FLOW_ORDER[0]!;
}

export function nextState(current: FlowState): FlowState {
  if (current === "not_started") return firstState();
  const index = FLOW_ORDER.indexOf(current);
  if (index === -1 || index >= FLOW_ORDER.length - 1) return "done";
  return FLOW_ORDER[index + 1]!;
}

export function isComplete(state: FlowState): boolean {
  return state === "done";
}

/** How far through the questionnaire somebody is, for a progress hint. */
export function progressOf(state: FlowState): { step: number; total: number } {
  const total = FLOW_ORDER.length - 1;
  const index = FLOW_ORDER.indexOf(state);
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
}

export interface Question {
  text: string;
  keyboard: InlineKeyboardMarkup;
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
        text: `🔢 ${bold(`How many did ${ctx.teamName} score?`)}\nBest guess is fine — everyone's answers get compared.${suffix}`,
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
        text: `🔢 ${bold(`And ${ctx.opponentName}?`)}${suffix}`,
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

/** Three per row keeps the names readable on a phone. */
function peerRows(peers: FlowPeer[]): InlineKeyboardMarkup["inline_keyboard"] {
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];
  for (let i = 0; i < peers.length; i += 3) {
    rows.push(
      peers.slice(i, i + 3).map((peer) => ({
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
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
}): string {
  const bits: string[] = [];
  if (params.goals > 0) bits.push(`${params.goals} ⚽`);
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

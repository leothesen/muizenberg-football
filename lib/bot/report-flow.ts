import { encodeCallback, type FlairField, type ReportField } from "@/lib/telegram/callbacks";
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
 * The core report is just three taps: your side's score, the other side's score, and
 * Man of the Match. Answering those three immediately files the report so nobody ever
 * loses out for skipping a long questionnaire. Everything else (goals, assists,
 * nutmegs, tackles, saves) is optional flair that can be added from the confirmation
 * message with +1 buttons.
 */
export const FLOW_ORDER: readonly FlowState[] = [
  "scoreFor",
  "scoreAgainst",
  "motm",
  "done",
] as const;

/** All states that questionFor can render, including legacy/optional states. */
const ALL_QUESTION_STATES: readonly FlowState[] = [
  "scoreFor",
  "scoreAgainst",
  "motm",
  "goals",
  "headers",
  "headedGoals",
  "assists",
  "nutmegs",
  "tackles",
  "saves",
  "rating",
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

function skipRow(fixtureId: string) {
  return [{ text: "Skip the rest", callback_data: encodeCallback({ kind: "reportSkip", fixtureId }) }];
}

/**
 * "Skip the rest?", shown in place of the question when somebody taps skip.
 *
 * Skipping files the report, and a filed report cannot be changed. It sits right
 * under the number buttons, so it is easy to hit by mistake, and somebody who did
 * lost the night's stats with no way back. One extra tap is cheap next to that.
 *
 * "Back" goes on the bottom row, where "Skip the rest" just was, so a double tap
 * lands on the safe button.
 */
export function skipConfirmation(fixtureId: string): Question {
  return {
    text: `⏭️ ${bold("Skip the rest?")}\nWhatever you've answered so far gets filed as is, and it can't be changed after.`,
    keyboard: {
      inline_keyboard: [
        [{ text: "Yes, file it", callback_data: encodeCallback({ kind: "reportSkipConfirm", fixtureId }) }],
        [{ text: "← Back to the question", callback_data: encodeCallback({ kind: "reportResume", fixtureId }) }],
      ],
    },
  };
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
        text: `⭐ ${bold("Who was man of the match?")}\nOne vote. Not yourself, obviously.${suffix}`,
        keyboard: {
          inline_keyboard: [
            ...peerRows(ctx.peers),
            // An answer, not a way out: it moves on to the rating like a vote does.
            [{ text: "Nobody stood out", callback_data: encodeCallback({ kind: "reportNoMotm", fixtureId }) }],
            skipRow(fixtureId),
          ],
        },
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

export interface FlairStats {
  goals: number;
  headedGoals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
}

export function completionMessage(params: FlairStats): string {
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
 * Offered under the "Logged" message so anyone who wants to record goals, assists,
 * nutmegs, tackles or saves for the flair leaderboards and badges can do so without
 * forcing everyone else through a 9-step form.
 */
export function completionKeyboard(fixtureId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "➕ Add goals, assists & flair (optional)",
          callback_data: encodeCallback({ kind: "reportFlair", fixtureId }),
        },
      ],
    ],
  };
}

/**
 * The optional stats screen: one +1 button per stat, edited in place on every tap.
 *
 * "+1 Headed goal" is a goal scored with the head, so it adds to both goals and
 * headed goals; "+1 Goal" is for every other goal. One tap per goal, whatever the
 * order. `lastTapped` is the stat the previous tap added to, and puts an "Undo last"
 * button on screen that takes exactly that tap back — a mis-tap otherwise stands
 * until the game is settled.
 */
export function flairDrawer(
  fixtureId: string,
  stats: FlairStats,
  lastTapped?: FlairField,
): Question {
  const tally = statTally(stats);
  const summary =
    tally.length > 0
      ? `\n\nLogged so far: ${bold(tally.join("  "))}`
      : "\n\n<i>Tap once for each one.</i>";

  const bump = (field: FlairField, label: string, count: number) => ({
    text: `${label}${count > 0 ? ` (${count})` : ""}`,
    callback_data: encodeCallback({ kind: "reportBump", field, fixtureId }),
  });

  const done = { text: "✅ Done", callback_data: encodeCallback({ kind: "reportSkipConfirm", fixtureId }) };
  const lastRow = lastTapped
    ? [
        {
          text: "↩️ Undo last",
          callback_data: encodeCallback({ kind: "reportUndo", field: lastTapped, fixtureId }),
        },
        done,
      ]
    : [done];

  return {
    text:
      `✨ ${bold("Your stats (optional)")}\nFor Golden Boot, Playmaker, Nutmeg King and your player card.` +
      summary,
    keyboard: {
      inline_keyboard: [
        [bump("goals", "+1 Goal ⚽", stats.goals - stats.headedGoals), bump("assists", "+1 Assist 🎁", stats.assists)],
        [bump("headedGoals", "+1 Headed goal 🦒", stats.headedGoals), bump("nutmegs", "+1 Nutmeg 🥜", stats.nutmegs)],
        [bump("tackles", "+1 Tackle 🧱", stats.tackles), bump("saves", "+1 Save 🧤", stats.saves)],
        lastRow,
      ],
    },
  };
}

function statTally(stats: FlairStats): string[] {
  const tally: string[] = [];
  if (stats.goals > 0) tally.push(`${stats.goals} ⚽`);
  if (stats.headedGoals > 0) tally.push(`${stats.headedGoals} 🦒`);
  if (stats.assists > 0) tally.push(`${stats.assists} 🎁`);
  if (stats.nutmegs > 0) tally.push(`${stats.nutmegs} 🥜`);
  if (stats.tackles > 0) tally.push(`${stats.tackles} 🧱`);
  if (stats.saves > 0) tally.push(`${stats.saves} 🧤`);
  return tally;
}

/** A tap on the stats screen, applied to a tally. Shared by the bot and the demo. */
export function applyFlairTap(stats: FlairStats, field: FlairField, direction: 1 | -1): FlairStats {
  const cap = field === "tackles" || field === "saves" ? 50 : 30;
  const step = (n: number) => Math.min(cap, Math.max(0, n + direction));
  const next = { ...stats };

  if (field === "headedGoals") {
    next.goals = step(stats.goals);
    next.headedGoals = step(stats.headedGoals);
  } else {
    next[field] = step(stats[field]);
  }
  // A headed goal is one of the goals, never extra.
  next.headedGoals = Math.min(next.headedGoals, next.goals);
  return next;
}

/**
 * Which question a given answer belongs to. Used to reject a tap on a stale keyboard:
 * Telegram leaves old buttons pressable, and without this check an out-of-order tap
 * could write to a field the flow has already moved past, or skip questions.
 *
 * Returns null for actions that are valid at any point, such as abandoning the flow.
 */
export function expectedStateFor(action: {
  kind:
    | "report"
    | "reportMotm"
    | "reportNoMotm"
    | "reportSkip"
    | "reportSkipConfirm"
    | "reportResume"
    | "reportFlair"
    | "reportBump"
    | "reportUndo";
  field?: string;
}): FlowState | null {
  if (
    action.kind === "reportSkip" ||
    action.kind === "reportSkipConfirm" ||
    action.kind === "reportResume" ||
    action.kind === "reportFlair" ||
    action.kind === "reportBump" ||
    action.kind === "reportUndo"
  ) {
    return null;
  }
  if (action.kind === "reportMotm" || action.kind === "reportNoMotm") return "motm";

  const field = action.field;
  return ALL_QUESTION_STATES.includes(field as FlowState) ? (field as FlowState) : null;
}

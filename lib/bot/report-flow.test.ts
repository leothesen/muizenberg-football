import { describe, expect, it } from "vitest";
import { decodeCallback } from "@/lib/telegram/callbacks";
import {
  FLOW_ORDER,
  completionMessage,
  expectedStateFor,
  firstState,
  isComplete,
  nextState,
  openingMessage,
  progressOf,
  questionFor,
  skipConfirmation,
  type FlowState,
  type QuestionContext,
} from "./report-flow";

const FIXTURE_ID = "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e";

const CTX: QuestionContext = {
  fixtureId: FIXTURE_ID,
  firstName: "Leo",
  teamName: "Black",
  opponentName: "White",
  peers: [
    { playerId: "p1", displayName: "Sipho", emoji: "⚡" },
    { playerId: "p2", displayName: "Ndu", emoji: "🌟" },
    { playerId: "p3", displayName: "Craig", emoji: "🐢" },
    { playerId: "p4", displayName: "Marco", emoji: "🍕" },
  ],
};

const ASKED: FlowState[] = FLOW_ORDER.filter((s) => s !== "done");
/** The questions everybody gets, without the ones that depend on an earlier answer. */
const ALWAYS: FlowState[] = ASKED.filter((s) => s !== "headers" && s !== "headedGoals");

describe("flow order", () => {
  it("starts with the score, the one answer the result depends on", () => {
    expect(firstState()).toBe("scoreFor");
    expect(nextState("not_started")).toBe("scoreFor");
    expect(nextState("scoreFor")).toBe("scoreAgainst");
    expect(nextState("scoreAgainst")).toBe("goals");
  });

  it("walks every question exactly once and then finishes", () => {
    const seen: FlowState[] = [];
    let state = firstState();
    for (let i = 0; i < 50 && !isComplete(state); i++) {
      seen.push(state);
      state = nextState(state);
    }
    expect(state).toBe("done");
    expect(seen).toEqual(ASKED);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("stays finished once finished", () => {
    expect(nextState("done")).toBe("done");
    expect(isComplete("done")).toBe(true);
  });

  it("treats an unrecognised state as finished rather than looping", () => {
    expect(nextState("nonsense" as FlowState)).toBe("done");
  });

  it("reports sensible progress", () => {
    expect(progressOf("scoreFor")).toEqual({ step: 1, total: ALWAYS.length });
    expect(progressOf("rating")).toEqual({ step: ALWAYS.length, total: ALWAYS.length });
  });

  it("counts the header follow-ups as part of the goals question", () => {
    // Otherwise somebody who scored nothing would watch the count jump from 3 to 6.
    const goals = progressOf("goals");
    expect(progressOf("headers")).toEqual(goals);
    expect(progressOf("headedGoals")).toEqual(goals);
    expect(progressOf("assists").step).toBe(goals.step + 1);
  });
});

describe("headers", () => {
  it("are never asked about by somebody who did not score", () => {
    expect(nextState("goals", { value: 0, goals: 0 })).toBe("assists");
  });

  it("are asked about by anybody who did", () => {
    expect(nextState("goals", { value: 1, goals: 0 })).toBe("headers");
    expect(nextState("goals", { value: 4, goals: 0 })).toBe("headers");
  });

  it("move straight on after a no", () => {
    expect(nextState("headers", { value: 0, goals: 3 })).toBe("assists");
  });

  it("only ask how many when there was more than one goal to choose from", () => {
    // One goal and "yes" already says it was one header.
    expect(nextState("headers", { value: 1, goals: 1 })).toBe("assists");
    expect(nextState("headers", { value: 1, goals: 3 })).toBe("headedGoals");
    expect(nextState("headedGoals", { value: 2, goals: 3 })).toBe("assists");
  });

  it("ask yes or no first, and say they count double", () => {
    const question = questionFor("headers", { ...CTX, goals: 2 })!;
    expect(question.text).toContain("Were any of those headers?");
    expect(question.text).toContain("count double");

    const [no, yes] = question.keyboard.inline_keyboard[0]!;
    expect(no!.text).toBe("No");
    expect(decodeCallback(no!.callback_data!)).toMatchObject({ field: "headers", value: 0 });
    expect(decodeCallback(yes!.callback_data!)).toMatchObject({ field: "headers", value: 1 });
  });

  it("offer no more headed goals than goals", () => {
    const values = (goals: number) =>
      questionFor("headedGoals", { ...CTX, goals })!
        .keyboard.inline_keyboard.flat()
        .map((b) => decodeCallback(b.callback_data!))
        .flatMap((a) => (a?.kind === "report" ? [a.value] : []));

    expect(values(2)).toEqual([1, 2]);
    expect(values(3)).toEqual([1, 2, 3]);
    expect(values(7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("questions", () => {
  it("asks something for every state in the flow", () => {
    for (const state of ASKED) {
      const question = questionFor(state, CTX);
      expect(question, state).not.toBeNull();
      expect(question!.text.length).toBeGreaterThan(10);
      expect(question!.keyboard.inline_keyboard.length).toBeGreaterThan(0);
    }
  });

  it("asks nothing once done", () => {
    expect(questionFor("done", CTX)).toBeNull();
    expect(questionFor("not_started", CTX)).toBeNull();
  });

  it("keeps every button inside Telegram's 64-byte callback limit", () => {
    for (const state of ASKED) {
      for (const row of questionFor(state, CTX)!.keyboard.inline_keyboard) {
        for (const button of row) {
          const bytes = new TextEncoder().encode(button.callback_data!).length;
          expect(bytes, `${state}: ${button.text}`).toBeLessThanOrEqual(64);
        }
      }
    }
  });

  it("encodes answers that decode back to the right field and value", () => {
    const goals = questionFor("goals", CTX)!.keyboard.inline_keyboard[0]!;
    expect(decodeCallback(goals[2]!.callback_data!)).toEqual({
      kind: "report",
      field: "goals",
      value: 2,
      fixtureId: FIXTURE_ID,
    });
  });

  it("asks about the score by the shirt, which is what people can see", () => {
    // "How many did Black score?" makes somebody translate a team name back into a
    // colour. Naming the shirt removes that step, and it is the same phrase the team
    // sheet used on Wednesday lunchtime.
    const forUs = questionFor("scoreFor", CTX)!.text;
    const against = questionFor("scoreAgainst", CTX)!.text;

    expect(forUs).toContain("black shirts");
    expect(forUs).toContain("your team");
    expect(against).toContain("white shirts");

    // And the other side's colour never appears in the question about ours, which is
    // the mix-up that would quietly corrupt every reported score.
    expect(forUs).not.toContain("white");
    expect(against).not.toContain("black");
  });

  it("offers every peer as a man-of-the-match vote, two to a row", () => {
    // Three to a row cut names like "Freddie" and "Brandon" short on a phone.
    const rows = questionFor("motm", CTX)!.keyboard.inline_keyboard;
    // The last two rows are "Nobody stood out" and the way out.
    const voteRows = rows.slice(0, -2);
    expect(voteRows.map((r) => r.length)).toEqual([2, 2]);

    const voted = voteRows.flat().map((b) => decodeCallback(b.callback_data!));
    expect(voted).toEqual(CTX.peers.map((p) => ({ kind: "reportMotm", playerId: p.playerId })));
  });

  it("always offers a way out", () => {
    for (const state of ASKED) {
      const rows = questionFor(state, CTX)!.keyboard.inline_keyboard;
      const last = rows.at(-1)!;
      expect(decodeCallback(last[0]!.callback_data!), state).toEqual({
        kind: "reportSkip",
        fixtureId: FIXTURE_ID,
      });
    }
  });

  it("treats \"Nobody stood out\" as an answer rather than a way out", () => {
    // It used to file the report, which quietly skipped the rating question as well.
    const rows = questionFor("motm", CTX)!.keyboard.inline_keyboard;
    const nobody = rows.flat().find((b) => b.text === "Nobody stood out")!;
    expect(decodeCallback(nobody.callback_data!)).toEqual({ kind: "reportNoMotm", fixtureId: FIXTURE_ID });
  });

  it("asks before skipping, with the safe button where skip just was", () => {
    // A double tap on the bottom row must not file the report.
    const rows = skipConfirmation(FIXTURE_ID).keyboard.inline_keyboard;
    expect(rows.map((row) => row.map((b) => decodeCallback(b.callback_data!)))).toEqual([
      [{ kind: "reportSkipConfirm", fixtureId: FIXTURE_ID }],
      [{ kind: "reportResume", fixtureId: FIXTURE_ID }],
    ]);
  });

  it("copes with a huge turnout without breaking the keyboard", () => {
    const peers = Array.from({ length: 21 }, (_, i) => ({
      playerId: `p${i}`,
      displayName: `Player ${i}`,
      emoji: "⚽",
    }));
    const rows = questionFor("motm", { ...CTX, peers })!.keyboard.inline_keyboard;
    expect(rows.flat().length).toBe(23);
    expect(rows.every((r) => r.length <= 2)).toBe(true);
  });

  it("escapes a hostile team name", () => {
    const text = questionFor("scoreFor", { ...CTX, teamName: "<b>x</b>" })!.text;
    expect(text).not.toContain("<b>x</b>");
    expect(text).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("wrapper messages", () => {
  it("opens without demanding anything", () => {
    const text = openingMessage("Leo");
    expect(text).toContain("Evening Leo");
    expect(text).toContain("on trust");
  });

  it("reads back what was logged", () => {
    const text = completionMessage({ goals: 2, headedGoals: 0, assists: 0, nutmegs: 1, tackles: 0, saves: 0 });
    expect(text).toContain("2 ⚽");
    expect(text).toContain("1 🥜");
    expect(text).not.toContain("0 🎁");
  });

  it("has something kind to say about a quiet game", () => {
    const text = completionMessage({ goals: 0, headedGoals: 0, assists: 0, nutmegs: 0, tackles: 0, saves: 0 });
    expect(text).toContain("A quiet one");
  });

  it("escapes the name it greets you with", () => {
    expect(openingMessage("<i>x</i>")).toContain("&lt;i&gt;x&lt;/i&gt;");
  });
});

describe("expectedStateFor", () => {
  it("maps each answer back to the question that asked it", () => {
    expect(expectedStateFor({ kind: "report", field: "goals" })).toBe("goals");
    expect(expectedStateFor({ kind: "report", field: "scoreAgainst" })).toBe("scoreAgainst");
    expect(expectedStateFor({ kind: "report", field: "rating" })).toBe("rating");
  });

  it("puts a man-of-the-match vote at the vote step", () => {
    expect(expectedStateFor({ kind: "reportMotm" })).toBe("motm");
    expect(expectedStateFor({ kind: "reportNoMotm" })).toBe("motm");
  });

  it("lets somebody abandon the flow from anywhere", () => {
    expect(expectedStateFor({ kind: "reportSkip" })).toBeNull();
    expect(expectedStateFor({ kind: "reportSkipConfirm" })).toBeNull();
    expect(expectedStateFor({ kind: "reportResume" })).toBeNull();
  });

  it("refuses to place an unknown field", () => {
    expect(expectedStateFor({ kind: "report", field: "nonsense" })).toBeNull();
    expect(expectedStateFor({ kind: "report" })).toBeNull();
  });

  it("covers every question the flow asks", () => {
    for (const state of FLOW_ORDER) {
      if (state === "done" || state === "motm") continue;
      expect(expectedStateFor({ kind: "report", field: state }), state).toBe(state);
    }
  });
});

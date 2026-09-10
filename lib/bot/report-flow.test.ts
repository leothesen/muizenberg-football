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
  type FlowState,
  type QuestionContext,
} from "./report-flow";

const FIXTURE_ID = "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e";

const CTX: QuestionContext = {
  fixtureId: FIXTURE_ID,
  firstName: "Leo",
  teamName: "Bibs",
  opponentName: "Skins",
  peers: [
    { playerId: "p1", displayName: "Sipho", emoji: "⚡" },
    { playerId: "p2", displayName: "Ndu", emoji: "🌟" },
    { playerId: "p3", displayName: "Craig", emoji: "🐢" },
    { playerId: "p4", displayName: "Marco", emoji: "🍕" },
  ],
};

const ASKED: FlowState[] = FLOW_ORDER.filter((s) => s !== "done");

describe("flow order", () => {
  it("starts at the first question", () => {
    expect(firstState()).toBe("goals");
    expect(nextState("not_started")).toBe("goals");
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
    expect(progressOf("goals")).toEqual({ step: 1, total: ASKED.length });
    expect(progressOf("rating")).toEqual({ step: ASKED.length, total: ASKED.length });
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

  it("names both teams when asking about the score", () => {
    expect(questionFor("scoreFor", CTX)!.text).toContain("Bibs");
    expect(questionFor("scoreAgainst", CTX)!.text).toContain("Skins");
  });

  it("offers every peer as a man-of-the-match vote, three to a row", () => {
    const rows = questionFor("motm", CTX)!.keyboard.inline_keyboard;
    const voteRows = rows.slice(0, -1);
    expect(voteRows[0]).toHaveLength(3);
    expect(voteRows[1]).toHaveLength(1);

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

  it("copes with a huge turnout without breaking the keyboard", () => {
    const peers = Array.from({ length: 21 }, (_, i) => ({
      playerId: `p${i}`,
      displayName: `Player ${i}`,
      emoji: "⚽",
    }));
    const rows = questionFor("motm", { ...CTX, peers })!.keyboard.inline_keyboard;
    expect(rows.flat().length).toBe(22);
    expect(rows.every((r) => r.length <= 3)).toBe(true);
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
    const text = completionMessage({ goals: 2, assists: 0, nutmegs: 1, tackles: 0, saves: 0 });
    expect(text).toContain("2 ⚽");
    expect(text).toContain("1 🥜");
    expect(text).not.toContain("0 🎁");
  });

  it("has something kind to say about a quiet game", () => {
    const text = completionMessage({ goals: 0, assists: 0, nutmegs: 0, tackles: 0, saves: 0 });
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
  });

  it("lets somebody abandon the flow from anywhere", () => {
    expect(expectedStateFor({ kind: "reportSkip" })).toBeNull();
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

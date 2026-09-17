import { describe, expect, it } from "vitest";
import { decodeCallback } from "@/lib/telegram/callbacks";
import { accepts, questionFor, type QuestionContext } from "./report-flow";
import { reportForm } from "./report-form";

const CONTEXT: QuestionContext = {
  fixtureId: "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e",
  firstName: "Leo",
  teamName: "White",
  opponentName: "Black",
  peers: [
    { playerId: "p2", displayName: "Tom", emoji: "⚽" },
    { playerId: "p3", displayName: "Luc", emoji: "🦖" },
  ],
};

describe("reportForm", () => {
  it("asks the same nine questions the chat asks", () => {
    const form = reportForm(CONTEXT);
    expect(form.questions).toHaveLength(9);
    expect(
      form.questions.map((q) => (q.kind === "motm" ? "motm" : q.field)),
    ).toEqual([
      "goals",
      "assists",
      "nutmegs",
      "tackles",
      "saves",
      "scoreFor",
      "scoreAgainst",
      "motm",
      "rating",
    ]);
  });

  it("offers exactly the values the chat buttons send", () => {
    // The two surfaces write to the same columns, so a league whose form accepts 10
    // tackles and whose buttons accept 15 would produce numbers nobody could explain.
    // They share one table; this is the proof they still do.
    for (const question of reportForm(CONTEXT).questions) {
      if (question.kind !== "count") continue;

      const keyboard = questionFor(question.field, CONTEXT)!.keyboard
        .inline_keyboard;
      const tapped = keyboard
        .flat()
        .map((button) => decodeCallback(String(button.callback_data)))
        .filter((action) => action?.kind === "report")
        .map((action) => (action as { value: number }).value);

      expect(question.choices.map((choice) => choice.value)).toEqual(tapped);
    }
  });

  it("names both sides by their shirts, which is what you were looking at", () => {
    const form = reportForm(CONTEXT);
    expect(form.questions[5]!.prompt).toContain("the white shirts");
    expect(form.questions[6]!.prompt).toContain("the black shirts");
  });

  it("offers everyone else who played for the man-of-the-match vote", () => {
    const motm = reportForm(CONTEXT).questions[7]!;
    expect(motm.kind).toBe("motm");
    expect(motm.kind === "motm" && motm.peers).toEqual(CONTEXT.peers);
  });
});

describe("accepts", () => {
  it("takes the numbers on the buttons", () => {
    expect(accepts("goals", 0)).toBe(true);
    expect(accepts("tackles", 15)).toBe(true);
    expect(accepts("rating", 10)).toBe(true);
  });

  it("refuses what no button could ever have sent", () => {
    // A keyboard can only send what it was drawn with. A form is a POST, and anybody
    // can write one, so the numbers are checked rather than trusted.
    expect(accepts("goals", 900000)).toBe(false);
    expect(accepts("goals", -1)).toBe(false);
    expect(accepts("tackles", 11)).toBe(false);
    expect(accepts("rating", 0)).toBe(false);
  });
});

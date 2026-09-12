import { describe, expect, it } from "vitest";
import { FLOW_ORDER } from "@/lib/bot/report-flow";
import { decodeCallback } from "@/lib/telegram/callbacks";
import { demoTranscript, type DemoHint, type DemoMessage } from "./transcript";

/**
 * The "how it works" page is the argument for installing a second messenger, so the
 * week it shows has to be the week the bot actually runs. Every bubble is rendered by
 * the real message builders; these are the assertions that keep the page honest if
 * somebody changes what those builders say.
 */

describe("the demo transcript", () => {
  const transcript = demoTranscript();

  it("walks a whole week, in order", () => {
    expect(transcript.map((m) => m.when)).toEqual([
      "Monday afternoon",
      "Tuesday morning",
      "The day before",
      "Match day, lunchtime",
      // The questionnaire goes out at 20:00 on the night of the game — `reports/ask`
      // at 18:00 UTC — and the report at 08:00 the next day. It was once labelled the
      // next morning, a whole night early for a message that opens "Evening".
      "That evening",
      "The next morning",
    ]);
  });

  it("gives every bubble something to say and at least one note about it", () => {
    for (const message of transcript) {
      expect(message.text.trim().length, message.when).toBeGreaterThan(0);
      expect(message.hints.length, message.when).toBeGreaterThan(0);
    }
  });

  it("comes to the player exactly the three times the page promises", () => {
    // The front page and the how-it-works lede both say the bot asks you three times a
    // week. That is a countable claim about this array rather than a turn of phrase.
    const yours = transcript.filter((m) => m.actor === "you");
    expect(yours.map((m) => m.when)).toEqual([
      "Monday afternoon",
      "The day before",
      "That evening",
    ]);
  });

  it("alternates you and the bot, which is the whole argument", () => {
    expect(transcript.map((m) => m.actor)).toEqual([
      "you",
      "bot",
      "you",
      "bot",
      "you",
      "bot",
    ]);
  });

  describe("the floating notes", () => {
    /** Whether a message has the part a note wants to point at. */
    function has(message: DemoMessage, hint: DemoHint): boolean {
      switch (hint.target) {
        case "keyboard":
          return Boolean(message.keyboard);
        case "photo":
          return Boolean(message.photo);
        case "badge":
          return Boolean(message.pinned || message.direct);
        case "text":
          return true;
        case "header":
          // The header is only worth a note when it says something — that this is
          // the private chat with the bot rather than the group.
          return Boolean(message.direct);
        case "toast":
          // A toast only exists as the answer to a tap, never on a step by itself.
          return false;
      }
    }

    it("only point at parts the message actually has", () => {
      // A note aimed at a keyboard that is not there has nowhere to float to. On a wide
      // screen it silently disappears; on a phone it describes something invisible.
      for (const message of transcript) {
        for (const hint of message.hints) {
          expect(has(message, hint), `${message.when}: "${hint.title}"`).toBe(true);
        }
      }
    });

    it("start with the thing to press, whenever there is one", () => {
      // Leading with a note about the pin while the buttons wait underneath is a
      // tour explaining the furniture before telling you where the door is.
      for (const message of transcript) {
        if (!message.keyboard) continue;
        expect(message.hints[0]!.target, message.when).toBe("keyboard");
      }
    });

    it("explain the answer to a tap as the toast it really is", () => {
      const tapped = transcript.filter((m) => m.reply);
      expect(tapped.length).toBeGreaterThan(0);

      for (const message of tapped) {
        expect(message.keyboard, "a reply needs a button to have been tapped").toBeTruthy();
        expect(message.reply!.text.length).toBeGreaterThan(0);
        expect(message.reply!.hint.target).toBe("toast");
      }
    });

    it("stay short enough to float", () => {
      // They sit in a column seventeen rems wide beside the chat, or stacked under it
      // on a phone where every line they take is a line of chat lost. Prose creeps
      // back one helpful sentence at a time; this is the fence.
      const all = transcript.flatMap((m) => [
        ...m.hints,
        ...(m.reply ? [m.reply.hint] : []),
        ...(m.questionnaire ? [m.questionnaire.loggedHint] : []),
      ]);

      for (const hint of all) {
        const title = hint.title.trim().split(/\s+/).length;
        const body = hint.body.trim().split(/\s+/).length;
        expect(title, hint.title).toBeLessThanOrEqual(4);
        expect(body, `"${hint.body}"`).toBeLessThanOrEqual(16);
      }
    });
  });

  it("shows the poll landing on the night that actually won", () => {
    const [poll, booked] = transcript;
    // Six voted Wednesday against four for Thursday, so both the poll and the
    // confirmation have to name Wednesday or the page is teaching the wrong thing.
    expect(poll!.text).toContain("Wednesday");
    expect(poll!.keyboard?.inline_keyboard.flat().map((b) => b.text)).toContain(
      "Wednesday  ·  6",
    );
    expect(booked!.text).toContain("Wednesday 16 September");
  });

  it("names the squad on the day before, with buttons to answer", () => {
    const squad = transcript.find((m) => m.when === "The day before")!;

    expect(squad.pinned).toBe(true);
    expect(squad.text).toContain("Sipho");
    expect(squad.text).toContain("Big Dave");
    expect(squad.keyboard?.inline_keyboard.flat().length).toBeGreaterThan(2);
  });

  it("sends the caption with a picture, not the long fallback text", () => {
    const teams = transcript.find((m) => m.when === "Match day, lunchtime")!;

    expect(teams.photo?.src).toBe("/api/og/demo/teams");
    expect(teams.text).toContain("Teams are up");
    // The fallback lists all eleven names. When the picture renders — which is what
    // this page is showing — the group gets one line instead.
    expect(teams.text).not.toContain("Sipho");
  });

  describe("the questionnaire", () => {
    const direct = transcript.filter((m) => m.direct);
    const step = direct[0]!;
    const questionnaire = step.questionnaire!;

    it("happens in a private chat, and is the only thing that does", () => {
      expect(direct).toHaveLength(1);
      expect(questionnaire).toBeTruthy();
    });

    it("is the real one: every question the bot asks, in its order", () => {
      // Built by `questionFor` over `FLOW_ORDER`, so if the bot grows a tenth question
      // the tour grows one too — and this test notices the count moved.
      const asked = FLOW_ORDER.filter((state) => state !== "done");
      expect(questionnaire.questions).toHaveLength(asked.length);

      questionnaire.questions.forEach((question, position) => {
        expect(question.text, `question ${position + 1}`).toContain(
          `${position + 1} of ${asked.length}`,
        );
      });
      expect(questionnaire.questions[0]!.text).toContain("How many did you score?");
      expect(questionnaire.questions.some((q) => q.text.includes("Nutmegs?"))).toBe(true);
    });

    it("opens on the first question, so the page reads right before anyone taps", () => {
      expect(step.text).toBe(questionnaire.questions[0]!.text);
      expect(step.keyboard).toEqual(questionnaire.questions[0]!.keyboard);
      expect(questionnaire.opening).toContain("Evening");
    });

    it("only has buttons the real handler knows how to answer", () => {
      // The tour decides what a tap does by decoding the button's own callback data,
      // exactly as `report-handler` does. A button that decodes to anything else
      // would be a dead tap on the one step that is all about tapping.
      for (const question of questionnaire.questions) {
        for (const button of question.keyboard.inline_keyboard.flat()) {
          const action = button.callback_data ? decodeCallback(button.callback_data) : null;
          expect(action?.kind, button.text).toMatch(/^(report|reportMotm|reportSkip)$/);
        }
      }
    });

    it("lets you vote for anybody who played except yourself", () => {
      const motm = questionnaire.questions.find((q) => q.text.includes("Who else played well?"))!;
      const names = motm.keyboard.inline_keyboard.flat().map((b) => b.text);

      expect(names.some((name) => name.includes("Jonty"))).toBe(true);
      expect(names.some((name) => name.includes("Thabo"))).toBe(true);
      // The reader is Pieter in this week.
      expect(names.some((name) => name.includes("Pieter"))).toBe(false);
    });
  });

  it("never says mores", () => {
    // The squad message said "Room for 11 mores" in the real group for weeks. This
    // page renders that exact line, so it is also the place that would show it again.
    for (const message of transcript) {
      expect(message.text, message.when).not.toContain("mores");
    }
  });

  it("points every picture at a demo route that needs no database, with its real size", () => {
    for (const message of transcript) {
      if (!message.photo) continue;
      expect(message.photo.src).toMatch(/^\/api\/og\/demo\//);
      expect(message.photo.alt.length).toBeGreaterThan(0);
      // The page reserves the picture's box from these before it loads. Zero or
      // missing and the chat jumps the moment the image arrives.
      expect(message.photo.width).toBeGreaterThan(100);
      expect(message.photo.height).toBeGreaterThan(100);
    }
  });
});

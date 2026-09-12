import { describe, expect, it } from "vitest";
import { demoTranscript } from "./transcript";

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
      "The next morning",
      "The next morning",
    ]);
  });

  it("gives every bubble something to say and something explaining it", () => {
    for (const message of transcript) {
      expect(message.text.trim().length, message.when).toBeGreaterThan(0);
      expect(message.note.trim().length, message.when).toBeGreaterThan(0);
    }
  });

  it("asks the player for exactly the three taps the page promises", () => {
    // The front page and the how-it-works lede both say "you tap three times a week".
    // That is a countable claim about this array rather than a turn of phrase, so a
    // seventh step or a step whose actor flipped would quietly make both pages lie.
    const yours = transcript.filter((m) => m.actor === "you");
    expect(yours.map((m) => m.when)).toEqual([
      "Monday afternoon",
      "The day before",
      "The next morning",
    ]);
  });

  it("alternates you and the bot, which is the whole argument", () => {
    // The page states "the bot does the rest" by labelling each step rather than by
    // asserting it in prose. That only reads as a pattern while it actually alternates.
    expect(transcript.map((m) => m.actor)).toEqual([
      "you",
      "bot",
      "you",
      "bot",
      "you",
      "bot",
    ]);
  });

  it("keeps the note beside a bubble shorter than the bubble", () => {
    // These notes used to run to twenty-five words and paraphrase the message they sat
    // next to. A cap is crude, but it is the thing that actually regressed, and prose
    // creeps back one helpful sentence at a time.
    for (const message of transcript) {
      const words = message.note.trim().split(/\s+/).length;
      expect(words, `${message.when}: "${message.note}"`).toBeLessThanOrEqual(14);
    }
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

  it("marks the questionnaire as a private message", () => {
    const direct = transcript.filter((m) => m.direct);
    expect(direct).toHaveLength(1);
    expect(direct[0]!.text).toContain("nutmeg");
  });

  it("never says mores", () => {
    // The squad message said "Room for 11 mores" in the real group for weeks. This
    // page renders that exact line, so it is also the place that would show it again.
    for (const message of transcript) {
      expect(message.text, message.when).not.toContain("mores");
    }
  });

  it("points every picture at a demo route that needs no database", () => {
    for (const message of transcript) {
      if (!message.photo) continue;
      expect(message.photo.src).toMatch(/^\/api\/og\/demo\//);
      expect(message.photo.alt.length).toBeGreaterThan(0);
    }
  });
});

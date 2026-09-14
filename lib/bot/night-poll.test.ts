import { describe, expect, it } from "vitest";
import { WEEKEND_THRESHOLD, resolveNights } from "@/domain/nights";
import { CALLBACK_DATA_MAX_BYTES, decodeCallback } from "@/lib/telegram/callbacks";
import {
  nightPollClosedMessage,
  nightPollKeyboard,
  nightPollMessage,
  nightVoteAcknowledgement,
  nightVoteRefusal,
  nightsResolvedMessage,
} from "./night-poll";

function votes(...nights: string[]): { night: string }[] {
  return nights.map((night) => ({ night }));
}

describe("nightPollMessage", () => {
  it("never suggests the game might not happen", () => {
    // An empty poll on a Monday morning is the normal state, not a warning sign. The
    // message it produces is the one that decides whether a quiet week becomes a dead
    // one, so it says the game is on and offers to be changed.
    const text = nightPollMessage(resolveNights([]));

    expect(text).toContain("Wednesday");
    expect(text).toContain("as usual");
    expect(text.toLowerCase()).not.toContain("cancel");
    expect(text.toLowerCase()).not.toContain("might not");
  });

  it("tells people they can pick more than one", () => {
    // Without this line people treat it as a single-choice poll, which splits
    // "Wednesday or Thursday" into two halves and picks a worse night than either.
    const text = nightPollMessage(resolveNights([]));
    expect(text).toContain("More than one is fine");
  });

  it("says which night is winning once anybody votes", () => {
    const text = nightPollMessage(resolveNights(votes("thu", "thu")));
    expect(text).toContain("Thursday");
    expect(text).toContain("2 votes");
  });

  it("says how close a weekend game is, rather than staying silent about it", () => {
    const text = nightPollMessage(
      resolveNights(votes("wed", ...Array(WEEKEND_THRESHOLD - 2).fill("sat"))),
    );
    expect(text).toContain("2 more votes");
    expect(text).toContain("weekend game");
  });

  it("announces a weekend game once it clears", () => {
    const text = nightPollMessage(
      resolveNights(votes("wed", ...Array(WEEKEND_THRESHOLD).fill("sun"))),
    );
    expect(text).toContain("Sunday game");
  });
});

describe("nightPollKeyboard", () => {
  it("offers every night on its own row", () => {
    const keyboard = nightPollKeyboard(resolveNights([]).tally);
    expect(keyboard.inline_keyboard).toHaveLength(5);
    expect(keyboard.inline_keyboard.every((row) => row.length === 1)).toBe(true);
  });

  it("puts the count on the button, which is what makes it read as a poll", () => {
    const keyboard = nightPollKeyboard(resolveNights(votes("wed", "wed")).tally);
    const labels = keyboard.inline_keyboard.flat().map((b) => b.text);

    expect(labels).toContain("Wednesday  ·  2");
    // A night nobody picked shows no zero: a row of zeroes reads as broken rather
    // than empty.
    expect(labels).toContain("Tuesday");
  });

  it("stays inside Telegram's callback_data limit", () => {
    // The limit is 64 bytes and Telegram rejects the entire keyboard, silently, if
    // any single button exceeds it.
    for (const button of nightPollKeyboard(resolveNights([]).tally).inline_keyboard.flat()) {
      const bytes = new TextEncoder().encode(button.callback_data!).length;
      expect(bytes).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES);
    }
  });

  it("round-trips through the callback codec", () => {
    const [first] = nightPollKeyboard(resolveNights([]).tally).inline_keyboard.flat();
    expect(decodeCallback(first!.callback_data!)).toEqual({ kind: "night", night: "tue" });
  });
});

describe("nightVoteAcknowledgement", () => {
  it("confirms a vote and says where it leaves things", () => {
    const text = nightVoteAcknowledgement({
      night: "Thursday",
      voted: true,
      votes: votes("thu", "thu"),
    });
    expect(text).toContain("Thursday");
  });

  it("confirms taking a vote back", () => {
    // The same button does both, so the reply has to distinguish them or a mis-tap
    // looks identical to a vote.
    const text = nightVoteAcknowledgement({ night: "Thursday", voted: false, votes: [] });
    expect(text).toContain("Took Thursday back");
  });

  it("fits in a callback answer", () => {
    // Telegram truncates these at 200 characters.
    const text = nightVoteAcknowledgement({ night: "Wednesday", voted: true, votes: [] });
    expect(text.length).toBeLessThanOrEqual(200);
  });
});

describe("nightsResolvedMessage", () => {
  const KICKOFF = new Date("2026-09-16T16:00:00Z");

  it("says a default was a default, rather than pretending it was a mandate", () => {
    // Somebody who ignored the poll should understand why Wednesday happened, and
    // somebody who voted should never be told a vote existed when it did not.
    const text = nightsResolvedMessage({
      outcome: resolveNights([]),
      weeknightKickoff: KICKOFF,
      weekendKickoff: null,
    });

    expect(text).toContain("Nobody voted");
    expect(text).toContain("Still on");
  });

  it("reports the count when there was one", () => {
    const text = nightsResolvedMessage({
      outcome: resolveNights(votes("wed", "wed", "wed")),
      weeknightKickoff: KICKOFF,
      weekendKickoff: null,
    });
    expect(text).toContain("3 votes");
    expect(text).not.toContain("Nobody voted");
  });

  it("announces both games when the weekend cleared", () => {
    const weekend = new Date("2026-09-19T15:00:00Z");
    const text = nightsResolvedMessage({
      outcome: resolveNights(votes("wed", ...Array(WEEKEND_THRESHOLD).fill("sat"))),
      weeknightKickoff: KICKOFF,
      weekendKickoff: weekend,
    });

    expect(text).toContain("Wednesday 16 September");
    expect(text).toContain("Saturday 19 September");
  });
});

describe("nightPollClosedMessage", () => {
  const KICKOFF = new Date("2026-09-16T15:30:00Z");

  it("says the poll is closed and names the night it booked", () => {
    // What the poll turns into once Tuesday's booking has run. It used to stay as it
    // was, buttons and all, still saying "Wednesday is winning" — so late taps kept
    // moving a count that no longer decided anything.
    const text = nightPollClosedMessage({
      outcome: resolveNights(votes("wed", "wed", "thu")),
      weeknightKickoff: KICKOFF,
      weekendKickoff: null,
    });

    expect(text).toContain("Poll's closed");
    expect(text).toContain("Wednesday 16 September");
    expect(text).not.toContain("is winning");
    expect(text).not.toContain("Tap every night");
  });

  it("keeps the final count, since the buttons that showed it are gone", () => {
    const text = nightPollClosedMessage({
      outcome: resolveNights(votes("wed", "wed", "thu")),
      weeknightKickoff: KICKOFF,
      weekendKickoff: null,
    });

    expect(text).toContain("Wednesday 2");
    expect(text).toContain("Thursday 1");
    // Nights nobody picked are noise in a final count.
    expect(text).not.toContain("Tuesday");
  });

  it("says a default was a default", () => {
    const text = nightPollClosedMessage({
      outcome: resolveNights([]),
      weeknightKickoff: KICKOFF,
      weekendKickoff: null,
    });

    expect(text).toContain("Poll's closed");
    expect(text).toContain("Nobody voted");
  });

  it("names the weekend game too when one was booked", () => {
    const text = nightPollClosedMessage({
      outcome: resolveNights(votes("wed", ...Array(WEEKEND_THRESHOLD).fill("sat"))),
      weeknightKickoff: KICKOFF,
      weekendKickoff: new Date("2026-09-19T15:00:00Z"),
    });

    expect(text).toContain("Saturday 19 September");
  });
});

describe("nightVoteRefusal", () => {
  it("fits in a callback answer and says why nothing happened", () => {
    // Shown to somebody tapping a poll that has already been decided. Silence would
    // look like a broken button; a count that moved would look like it still mattered.
    const text = nightVoteRefusal();
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text).toContain("closed");
  });
});

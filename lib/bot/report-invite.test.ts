import { describe, expect, it } from "vitest";
import { decodeCallback } from "@/lib/telegram/callbacks";
import { reportInviteKeyboard, reportInviteMessage } from "./report-invite";

const FIXTURE_ID = "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e";
// 17:30 in Cape Town.
const KICKOFF = new Date("2026-09-16T15:30:00Z");
const TEAMS = { a: "Black", b: "White" };

describe("reportInviteMessage", () => {
  it("leads with the score, as a question", () => {
    // "How did it go?" read like small talk. The score is what everybody wants
    // settled, and the first thing the button asks.
    const text = reportInviteMessage({
      kickoffAt: KICKOFF,
      teams: TEAMS,
      players: [{ telegramUserId: 101, displayName: "Tom" }],
    });

    expect(text.split("\n")[0]).toContain("What was the score?");
    expect(text).toContain("add the score, then your goals");
  });

  it("names both sides and the game, in league time", () => {
    const text = reportInviteMessage({
      kickoffAt: KICKOFF,
      teams: TEAMS,
      players: [{ telegramUserId: 101, displayName: "Tom" }],
    });

    expect(text).toContain("Black v White · Wednesday 16 September, 17:30");
  });

  it("mentions everyone by id, so it notifies people with no username", () => {
    const text = reportInviteMessage({
      kickoffAt: KICKOFF,
      teams: TEAMS,
      players: [
        { telegramUserId: 101, displayName: "Tom" },
        { telegramUserId: 102, displayName: "Leo" },
        { telegramUserId: 103, displayName: "Liam" },
      ],
    });

    expect(text).toContain(
      '<a href="tg://user?id=101">Tom</a>, <a href="tg://user?id=102">Leo</a> and ' +
        '<a href="tg://user?id=103">Liam</a>',
    );
  });

  it("escapes names that would otherwise be read as markup", () => {
    const text = reportInviteMessage({
      kickoffAt: KICKOFF,
      teams: { a: "<i>Black", b: "White" },
      players: [{ telegramUserId: 101, displayName: "<b>Tom" }],
    });

    expect(text).toContain(">&lt;b&gt;Tom</a>");
    expect(text).toContain("&lt;i&gt;Black v White");
  });
});

describe("reportInviteKeyboard", () => {
  it("carries one button, saying what it does, that starts this fixture's questionnaire", () => {
    const keyboard = reportInviteKeyboard(FIXTURE_ID);

    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(1);

    const button = keyboard.inline_keyboard[0]![0]!;
    expect(button.text).toContain("score");
    expect(decodeCallback(String(button.callback_data))).toEqual({
      kind: "reportStart",
      fixtureId: FIXTURE_ID,
    });
  });
});

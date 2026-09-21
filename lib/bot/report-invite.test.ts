import { describe, expect, it } from "vitest";
import { decodeCallback } from "@/lib/telegram/callbacks";
import { reportInviteKeyboard, reportInviteMessage } from "./report-invite";

const FIXTURE_ID = "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e";
// 17:30 in Cape Town.
const KICKOFF = new Date("2026-09-16T15:30:00Z");

describe("reportInviteMessage", () => {
  it("mentions everyone by id, so it notifies people with no username", () => {
    const text = reportInviteMessage({
      kickoffAt: KICKOFF,
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

  it("names the game, in league time", () => {
    const text = reportInviteMessage({
      kickoffAt: KICKOFF,
      players: [{ telegramUserId: 101, displayName: "Tom" }],
    });

    expect(text).toContain("Wednesday 16 September, 17:30");
  });

  it("escapes a name that would otherwise be read as markup", () => {
    const text = reportInviteMessage({
      kickoffAt: KICKOFF,
      players: [{ telegramUserId: 101, displayName: "<b>Tom" }],
    });

    expect(text).toContain(">&lt;b&gt;Tom</a>");
  });
});

describe("reportInviteKeyboard", () => {
  it("carries one button that starts this fixture's questionnaire", () => {
    const keyboard = reportInviteKeyboard(FIXTURE_ID);

    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(1);
    expect(decodeCallback(String(keyboard.inline_keyboard[0]![0]!.callback_data))).toEqual({
      kind: "reportStart",
      fixtureId: FIXTURE_ID,
    });
  });
});

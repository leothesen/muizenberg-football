import { describe, expect, it } from "vitest";
import {
  REPORT_START_PAYLOAD,
  chaseKeyboard,
  chaseMessage,
} from "./report-chase";

describe("chaseMessage", () => {
  it("names them and says whose rule it is that they cannot be DMed", async () => {
    // The failure it replaces was silence. Somebody who has never messaged the bot
    // was dropped from the questionnaire without a word, and the morning after read
    // as though they had not bothered to answer.
    const text = chaseMessage("Leo");

    expect(text).toContain("<b>Leo</b>");
    expect(text).toContain("Telegram's rule, not mine");
    expect(text).toContain("Only you can see this message");
  });

  it("escapes a name that would otherwise be read as markup", () => {
    expect(chaseMessage("<b>Leo")).toContain("&lt;b&gt;Leo");
  });
});

describe("chaseKeyboard", () => {
  it("puts the private chat first, because it fixes the problem permanently", () => {
    const keyboard = chaseKeyboard({
      botUsername: "LeagueBot",
      miniAppUrl: "https://example.test/app",
    });

    expect(keyboard!.inline_keyboard[0]![0]!).toMatchObject({
      url: `https://t.me/LeagueBot?start=${REPORT_START_PAYLOAD}`,
    });
    expect(keyboard!.inline_keyboard[1]![0]!).toMatchObject({
      web_app: { url: "https://example.test/app" },
    });
  });

  it("still offers the Mini App when the bot's username is not known", () => {
    // This is the state production was actually in: no username anywhere, so no deep
    // link could be built. A chase with one way out beats a chase with none.
    const keyboard = chaseKeyboard({ miniAppUrl: "https://example.test/app" });

    expect(keyboard!.inline_keyboard).toHaveLength(1);
    expect(keyboard!.inline_keyboard[0]![0]!).toMatchObject({
      web_app: { url: "https://example.test/app" },
    });
  });

  it("is undefined rather than empty when there is nowhere to send them", () => {
    expect(chaseKeyboard({})).toBeUndefined();
  });
});

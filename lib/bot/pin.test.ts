import { describe, expect, it } from "vitest";
import { RecordingTransport, TelegramClient } from "@/lib/telegram/client";
import { focusPin, squadPollOutranksNightPoll } from "./pin";

const CHAT = -100123;

function clientWith(transport: RecordingTransport) {
  return new TelegramClient(transport);
}

describe("handing the pin on", () => {
  it("clears the board before pinning what is live now", async () => {
    const transport = new RecordingTransport();

    const result = await focusPin(clientWith(transport), { chatId: CHAT, messageId: 900 });

    expect(result).toEqual({ pinned: true, cleared: true });
    // Order matters: pinning first and clearing second would unpin the new message.
    expect(transport.calls.map((c) => c.method)).toEqual([
      "unpinAllChatMessages",
      "pinChatMessage",
    ]);
    expect(transport.lastCallTo("pinChatMessage")?.params).toMatchObject({
      chat_id: CHAT,
      message_id: 900,
      disable_notification: true,
    });
  });
});

describe("when Telegram says no", () => {
  it("still pins when the board cannot be cleared", async () => {
    // Worst case the group is left with two pins, which beats being left with only
    // the old one — the stale pin is the whole problem.
    const transport = new RecordingTransport().fail(
      "unpinAllChatMessages",
      new Error("Bad Request: not enough rights to manage pinned messages"),
    );

    const result = await focusPin(clientWith(transport), { chatId: CHAT, messageId: 900 });

    expect(result).toEqual({ pinned: true, cleared: false });
    expect(transport.callsTo("pinChatMessage")).toHaveLength(1);
  });

  it("reports an unpinned pin rather than failing the run", async () => {
    // Pinning needs an admin right the bot may never have been given. The message is
    // in the chat and tappable; the cron did the thing it was for.
    const transport = new RecordingTransport().fail(
      "pinChatMessage",
      new Error("Bad Request: not enough rights to pin a message"),
    );

    const result = await focusPin(clientWith(transport), { chatId: CHAT, messageId: 900 });

    expect(result).toEqual({ pinned: false, cleared: true });
  });
});

describe("two live questions at once", () => {
  const MONDAY = new Date("2026-09-21T06:00:00Z");

  it("leaves the pin on a game that has not been played yet", () => {
    // An ad hoc Tuesday fixture has its squad list up before the week's vote goes
    // out. Answerable now and expired by tomorrow beats a vote about next week.
    expect(
      squadPollOutranksNightPoll(
        { rsvp_message_id: 800, kickoff_at: "2026-09-22T16:00:00Z" },
        MONDAY,
      ),
    ).toBe(true);
  });

  it("takes it back from a game that has been and gone", () => {
    // A fixture too thin for sides is never cancelled, so it stays `open` for ever.
    // Asking only whether a squad list exists would pin that week permanently.
    expect(
      squadPollOutranksNightPoll(
        { rsvp_message_id: 800, kickoff_at: "2026-09-16T16:00:00Z" },
        MONDAY,
      ),
    ).toBe(false);
  });

  it("does not defer to a fixture nobody has been asked about", () => {
    expect(
      squadPollOutranksNightPoll(
        { rsvp_message_id: null, kickoff_at: "2026-09-23T16:00:00Z" },
        MONDAY,
      ),
    ).toBe(false);
    expect(squadPollOutranksNightPoll(null, MONDAY)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { foldEmulator, visibleTo, type EmulatorRow } from "./emulator-fold";

let nextId = 0;
function row(method: string, params: Record<string, unknown>, extra: Partial<EmulatorRow> = {}): EmulatorRow {
  nextId += 1;
  return {
    id: extra.id ?? nextId,
    method,
    params,
    chat_id: (params.chat_id as number) ?? null,
    receiver_user_id: null,
    target_message_id: (params.message_id as number) ?? null,
    created_at: new Date(2026, 8, 15, 12, nextId).toISOString(),
    ...extra,
  };
}

describe("foldEmulator", () => {
  it("renders a plain message", () => {
    const view = foldEmulator([row("sendMessage", { chat_id: -1, text: "Who's keen?" })]);
    expect(view.messages).toHaveLength(1);
    expect(view.messages[0]).toMatchObject({ text: "Who's keen?", kind: "text", editedAt: null });
  });

  it("applies an edit in place rather than appending a second message", () => {
    const sent = row("sendMessage", { chat_id: -1, text: "IN — 0/22" }, { id: 10 });
    const edit = row("editMessageText", { chat_id: -1, message_id: 10, text: "IN — 1/22" }, { id: 11 });

    const view = foldEmulator([sent, edit]);
    expect(view.messages).toHaveLength(1);
    expect(view.messages[0]!.text).toBe("IN — 1/22");
    expect(view.messages[0]!.editedAt).not.toBeNull();
  });

  it("replays rows oldest first regardless of the order they arrive in", () => {
    const sent = row("sendMessage", { chat_id: -1, text: "first" }, { id: 1 });
    const editA = row("editMessageText", { chat_id: -1, message_id: 1, text: "second" }, { id: 2 });
    const editB = row("editMessageText", { chat_id: -1, message_id: 1, text: "third" }, { id: 3 });

    expect(foldEmulator([editB, sent, editA]).messages[0]!.text).toBe("third");
  });

  it("drops a deleted message", () => {
    const sent = row("sendMessage", { chat_id: -1, text: "oops" }, { id: 20 });
    const del = row("deleteMessage", { chat_id: -1, message_id: 20 }, { id: 21 });
    expect(foldEmulator([sent, del]).messages).toHaveLength(0);
  });

  it("ignores an edit for a message that no longer exists", () => {
    const edit = row("editMessageText", { chat_id: -1, message_id: 999, text: "ghost" });
    expect(foldEmulator([edit]).messages).toHaveLength(0);
  });

  it("records who an ephemeral message is for", () => {
    const view = foldEmulator([
      row(
        "sendMessage",
        {
          chat_id: -1,
          text: "Welcome",
          ephemeral_message_parameters: { receiver_user_id: 777 },
        },
        { receiver_user_id: 777 },
      ),
    ]);
    expect(view.messages[0]!.ephemeralFor).toBe(777);
  });

  it("keeps the keyboard, and replaces it on edit", () => {
    const sent = row(
      "sendMessage",
      { chat_id: -1, text: "poll", reply_markup: { inline_keyboard: [[{ text: "In" }]] } },
      { id: 30 },
    );
    const edit = row(
      "editMessageReplyMarkup",
      { chat_id: -1, message_id: 30, reply_markup: { inline_keyboard: [[{ text: "Closed" }]] } },
      { id: 31 },
    );

    const view = foldEmulator([sent, edit]);
    expect(view.messages[0]!.keyboard[0]![0]!.text).toBe("Closed");
  });

  it("shows a photo as its own kind", () => {
    const view = foldEmulator([
      row("sendPhoto", { chat_id: -1, photo: "<4021 bytes>", caption: "Your card" }),
    ]);
    expect(view.messages[0]).toMatchObject({ kind: "photo", text: "Your card" });
  });

  it("attaches a reaction and a pin to the message they target", () => {
    const sent = row("sendMessage", { chat_id: -1, text: "squad" }, { id: 40 });
    const react = row("setMessageReaction", { chat_id: -1, message_id: 40, reaction: [{ emoji: "👍" }] }, { id: 41 });
    const pin = row("pinChatMessage", { chat_id: -1, message_id: 40 }, { id: 42 });

    const view = foldEmulator([sent, react, pin]);
    expect(view.messages[0]).toMatchObject({ reaction: "👍", pinned: true });
  });

  it("collects callback answers as alerts, not messages", () => {
    const view = foldEmulator([
      row("answerCallbackQuery", { callback_query_id: "c", text: "You're in", show_alert: false }),
      row("answerCallbackQuery", { callback_query_id: "c", text: "Waiting list", show_alert: true }),
      row("answerCallbackQuery", { callback_query_id: "c" }),
    ]);

    expect(view.messages).toHaveLength(0);
    expect(view.alerts).toHaveLength(2);
    expect(view.alerts[1]).toMatchObject({ text: "Waiting list", modal: true });
  });
});

describe("visibleTo", () => {
  const messages = foldEmulator([
    row("sendMessage", { chat_id: -1, text: "public" }, { id: 1 }),
    row(
      "sendMessage",
      { chat_id: -1, text: "for Leo", ephemeral_message_parameters: { receiver_user_id: 111 } },
      { id: 2, receiver_user_id: 111 },
    ),
    row(
      "sendMessage",
      { chat_id: -1, text: "for Sipho", ephemeral_message_parameters: { receiver_user_id: 222 } },
      { id: 3, receiver_user_id: 222 },
    ),
  ]).messages;

  it("hides another person's ephemeral message completely", () => {
    const texts = visibleTo(messages, 111).map((m) => m.text);
    expect(texts).toEqual(["public", "for Leo"]);
  });

  it("shows only public messages to somebody with no id", () => {
    expect(visibleTo(messages, null).map((m) => m.text)).toEqual(["public"]);
  });
});

describe("visibleTo, scoped to one person's chats", () => {
  const messages = foldEmulator([
    row("sendMessage", { chat_id: -1, text: "public" }, { id: 1 }),
    row("sendMessage", { chat_id: 111, text: "Leo's questionnaire" }, { id: 2 }),
    row("sendMessage", { chat_id: 222, text: "Sipho's questionnaire" }, { id: 3 }),
  ]).messages;

  it("keeps somebody else's DMs out of your chat", () => {
    // Showing every player's private questionnaire to whoever is reading made the
    // post-match questions look like a public interrogation — the opposite of the
    // decision they represent.
    const texts = visibleTo(messages, 111, {
      groupChatId: -1,
      viewerPrivateChatId: 111,
    }).map((m) => m.text);

    expect(texts).toEqual(["public", "Leo's questionnaire"]);
  });

  it("shows the group only, to somebody the bot has never DM'd", () => {
    const texts = visibleTo(messages, 999, {
      groupChatId: -1,
      viewerPrivateChatId: null,
    }).map((m) => m.text);

    expect(texts).toEqual(["public"]);
  });

  it("shows everything when no group is named, for poking at the outbox", () => {
    // The old behaviour, kept: a developer reading the raw outbox wants all of it.
    expect(visibleTo(messages, 111)).toHaveLength(3);
  });
});

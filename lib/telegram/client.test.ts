import { describe, expect, it, vi } from "vitest";
import {
  HttpTelegramTransport,
  RecordingTransport,
  TelegramApiError,
  TelegramClient,
} from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Must match typeof fetch exactly, or the mock is not assignable to fetchImpl.
type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function okFetch(result: unknown = { message_id: 7 }) {
  return vi.fn(async (..._args: FetchArgs) => jsonResponse({ ok: true, result }));
}

describe("HttpTelegramTransport", () => {
  it("posts JSON to the method URL for the given token", async () => {
    const fetchImpl = okFetch();
    const transport = new HttpTelegramTransport({ token: "TOKEN123", fetchImpl });

    await transport.call("sendMessage", { chat_id: 5, text: "hi" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/botTOKEN123/sendMessage");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({ chat_id: 5, text: "hi" });
  });

  it("targets the test servers when asked", async () => {
    const fetchImpl = okFetch();
    const transport = new HttpTelegramTransport({
      token: "T",
      useTestEnvironment: true,
      fetchImpl,
    });

    await transport.call("getMe", {});
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.telegram.org/botT/test/getMe");
  });

  it("returns the result rather than the envelope", async () => {
    const transport = new HttpTelegramTransport({
      token: "T",
      fetchImpl: okFetch({ message_id: 99 }),
    });
    await expect(transport.call("sendMessage", {})).resolves.toEqual({ message_id: 99 });
  });

  it("throws a typed error carrying the code and description", async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) =>
      jsonResponse({ ok: false, error_code: 400, description: "chat not found" }, 400),
    );
    const transport = new HttpTelegramTransport({ token: "T", fetchImpl });

    await expect(transport.call("sendMessage", {})).rejects.toMatchObject({
      name: "TelegramApiError",
      errorCode: 400,
      description: "chat not found",
      method: "sendMessage",
    });
  });

  it("waits the requested time and retries once rate limited", async () => {
    const sleep = vi.fn(async () => {});
    let attempts = 0;
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ ok: false, error_code: 429, parameters: { retry_after: 3 } }, 429)
        : jsonResponse({ ok: true, result: { message_id: 1 } });
    });

    const transport = new HttpTelegramTransport({ token: "T", fetchImpl, sleep });
    await expect(transport.call("sendMessage", {})).resolves.toEqual({ message_id: 1 });

    expect(sleep).toHaveBeenCalledWith(3000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up rather than retrying a rate limit forever", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (..._args: FetchArgs) =>
      jsonResponse({ ok: false, error_code: 429, parameters: { retry_after: 1 } }, 429),
    );

    const transport = new HttpTelegramTransport({ token: "T", fetchImpl, sleep, maxRetries: 2 });
    await expect(transport.call("sendMessage", {})).rejects.toBeInstanceOf(TelegramApiError);

    // One original attempt plus two retries.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry an error that is not a rate limit", async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) =>
      jsonResponse({ ok: false, error_code: 403, description: "bot was blocked" }, 403),
    );
    const transport = new HttpTelegramTransport({ token: "T", fetchImpl });

    await expect(transport.call("sendMessage", {})).rejects.toMatchObject({ errorCode: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("switches to multipart when raw bytes are present", async () => {
    const fetchImpl = okFetch();
    const transport = new HttpTelegramTransport({ token: "T", fetchImpl });

    await transport.call("sendPhoto", {
      chat_id: 5,
      photo: new Uint8Array([1, 2, 3]),
      reply_markup: { inline_keyboard: [] },
      caption: undefined,
    });

    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("chat_id")).toBe("5");
    // Nested objects have to be JSON-encoded inside a multipart body.
    expect(form.get("reply_markup")).toBe('{"inline_keyboard":[]}');
    expect(form.get("photo")).toBeInstanceOf(Blob);
    expect(form.has("caption")).toBe(false);
  });
});

describe("TelegramApiError", () => {
  it("knows a blocked user from a rate limit", () => {
    expect(new TelegramApiError("m", 403, "blocked").isBlockedByUser).toBe(true);
    expect(new TelegramApiError("m", 429, "slow down").isRateLimited).toBe(true);
    expect(new TelegramApiError("m", 400, "bad").isBlockedByUser).toBe(false);
  });
});

describe("TelegramClient", () => {
  it("omits undefined parameters entirely", async () => {
    const transport = new RecordingTransport();
    const client = new TelegramClient(transport);

    await client.sendMessage({ chat_id: 1, text: "hello" });

    expect(transport.lastCallTo("sendMessage")!.params).toEqual({ chat_id: 1, text: "hello" });
  });

  it("refuses to put a menu button on a group", async () => {
    // A group has no menu button. Telegram answers a group id here with
    // "Bad Request: invalid chat_id specified", which reads like the chat id is
    // wrong — and on 10 Sep 2026 it was not: getChat accepted the very same id.
    // The whole registration died on this call and the webhook, which comes after
    // it, was never set.
    const transport = new RecordingTransport();
    const client = new TelegramClient(transport);

    expect(() =>
      client.setChatMenuButton(
        { type: "web_app", text: "League", web_app: { url: "https://x.test/app" } },
        -1004423515292,
      ),
    ).toThrow(/private chat id/);

    // And it never reached the wire, which is the point — a 400 mid-sequence takes
    // every later call down with it.
    expect(transport.callsTo("setChatMenuButton")).toHaveLength(0);
  });

  it("sets the default menu button for every private chat", async () => {
    const transport = new RecordingTransport();
    const client = new TelegramClient(transport);

    await client.setChatMenuButton({
      type: "web_app",
      text: "League",
      web_app: { url: "https://x.test/app" },
    });

    // No chat_id at all: that is what makes it the default everywhere.
    expect(transport.lastCallTo("setChatMenuButton")!.params).toEqual({
      menu_button: {
        type: "web_app",
        text: "League",
        web_app: { url: "https://x.test/app" },
      },
    });
  });

  it("still accepts a private chat id", async () => {
    const transport = new RecordingTransport();
    const client = new TelegramClient(transport);

    await client.setChatMenuButton({ type: "default" }, 8764774532);

    expect(transport.lastCallTo("setChatMenuButton")!.params).toMatchObject({
      chat_id: 8764774532,
    });
  });

  it("builds an ephemeral message aimed at one person", async () => {
    const transport = new RecordingTransport();
    const client = new TelegramClient(transport);

    await client.sendEphemeral(-100200, 4242, "Only you can see this", {
      callbackQueryId: "cbq-1",
    });

    expect(transport.lastCallTo("sendMessage")!.params).toMatchObject({
      chat_id: -100200,
      text: "Only you can see this",
      parse_mode: "HTML",
      ephemeral_message_parameters: {
        receiver_user_id: 4242,
        callback_query_id: "cbq-1",
      },
    });
  });

  it("addresses an ephemeral edit by receiver, not by message id alone", async () => {
    const transport = new RecordingTransport();
    const client = new TelegramClient(transport);

    await client.editEphemeralMessageText({
      chat_id: -100200,
      receiver_user_id: 4242,
      ephemeral_message_id: 9,
      text: "updated",
    });

    expect(transport.lastCallTo("editEphemeralMessageText")!.params).toMatchObject({
      chat_id: -100200,
      receiver_user_id: 4242,
      ephemeral_message_id: 9,
    });
  });

  it("wraps a reaction emoji in the array shape the API wants", async () => {
    const transport = new RecordingTransport();
    const client = new TelegramClient(transport);

    await client.setMessageReaction(-1, 5, "👍");
    expect(transport.lastCallTo("setMessageReaction")!.params).toEqual({
      chat_id: -1,
      message_id: 5,
      reaction: [{ type: "emoji", emoji: "👍" }],
    });

    await client.setMessageReaction(-1, 5, null);
    expect(transport.lastCallTo("setMessageReaction")!.params).toMatchObject({ reaction: [] });
  });

  it("records calls for assertions instead of hitting the network", async () => {
    const transport = new RecordingTransport({ getMe: { id: 1, is_bot: true, first_name: "Bot" } });
    const client = new TelegramClient(transport);

    await expect(client.getMe()).resolves.toMatchObject({ first_name: "Bot" });
    expect(transport.callsTo("getMe")).toHaveLength(1);
  });
});

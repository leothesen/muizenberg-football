import type {
  AnswerInlineQueryParams,
  AnswerCallbackQueryParams,
  BotCommand,
  BotCommandScope,
  EditEphemeralMessageTextParams,
  EditMessageTextParams,
  InlineKeyboardMarkup,
  MenuButton,
  SendMessageParams,
  SendPhotoParams,
  SetWebhookParams,
  TelegramMessage,
  TelegramUser,
} from "./types";

/**
 * The Bot API client.
 *
 * Everything goes through a `TelegramTransport`, so the entire bot can be driven by
 * the local emulator without a token, and unit tests can assert on the exact calls
 * that would have been made.
 */

export interface TelegramTransport {
  call<T>(method: string, params: Record<string, unknown>): Promise<T>;
}

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly errorCode: number,
    readonly description: string,
    readonly retryAfter?: number,
  ) {
    super(`Telegram ${method} failed (${errorCode}): ${description}`);
    this.name = "TelegramApiError";
  }

  /** 403 means the user blocked the bot or never started it. Never worth retrying. */
  get isBlockedByUser(): boolean {
    return this.errorCode === 403;
  }

  get isRateLimited(): boolean {
    return this.errorCode === 429;
  }
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

export interface HttpTransportOptions {
  token: string;
  /** Telegram's test servers, where Mini Apps work over plain HTTP. */
  useTestEnvironment?: boolean;
  fetchImpl?: typeof fetch;
  /** How many times to retry a 429. */
  maxRetries?: number;
  /** Injected so tests do not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_SLEEP = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpTelegramTransport implements TelegramTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HttpTransportOptions) {
    const suffix = options.useTestEnvironment ? "/test" : "";
    this.baseUrl = `https://api.telegram.org/bot${options.token}${suffix}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.sleep = options.sleep ?? DEFAULT_SLEEP;
  }

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    let attempt = 0;

    for (;;) {
      const response = await this.fetchImpl(`${this.baseUrl}/${method}`, this.request(params));
      const body = (await response.json()) as TelegramResponse<T>;

      if (body.ok && body.result !== undefined) return body.result;

      const errorCode = body.error_code ?? response.status;
      const retryAfter = body.parameters?.retry_after;

      // Telegram asks for a specific wait when we are going too fast. Honour it
      // rather than hammering, but only a bounded number of times.
      if (errorCode === 429 && retryAfter !== undefined && attempt < this.maxRetries) {
        attempt += 1;
        await this.sleep(retryAfter * 1000);
        continue;
      }

      throw new TelegramApiError(
        method,
        errorCode,
        body.description ?? "unknown error",
        retryAfter,
      );
    }
  }

  /**
   * Raw bytes have to go as multipart; everything else is far easier to read and log
   * as JSON.
   */
  private request(params: Record<string, unknown>): RequestInit {
    const binaryEntry = Object.entries(params).find(([, v]) => v instanceof Uint8Array);

    if (!binaryEntry) {
      return {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
      };
    }

    const form = new FormData();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (value instanceof Uint8Array) {
        form.append(key, new Blob([new Uint8Array(value)], { type: "image/png" }), `${key}.png`);
      } else if (typeof value === "object") {
        form.append(key, JSON.stringify(value));
      } else {
        form.append(key, String(value));
      }
    }
    return { method: "POST", body: form };
  }
}

/** Strips undefined so Telegram never sees a null it did not ask for. */
function clean(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
}

export class TelegramClient {
  constructor(private readonly transport: TelegramTransport) {}

  getMe(): Promise<TelegramUser> {
    return this.transport.call("getMe", {});
  }

  sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    return this.transport.call("sendMessage", clean({ ...params }));
  }

  sendPhoto(params: SendPhotoParams): Promise<TelegramMessage> {
    return this.transport.call("sendPhoto", clean({ ...params }));
  }

  answerInlineQuery(params: AnswerInlineQueryParams): Promise<true> {
    return this.transport.call("answerInlineQuery", clean({ ...params }));
  }

  /**
   * Sends with a message effect, and again without it if Telegram objects.
   *
   * Worth the extra code because effect ids are not in the Bot API reference at all —
   * they are client-side constants that could be renumbered or retired without notice.
   * An unknown one makes the whole `sendMessage` fail, so without this fallback a bit
   * of confetti could cost somebody the message it was decorating.
   *
   * Effects are private-chat only, which the caller is expected to honour; a group
   * chat here would simply lose the effect on the retry.
   */
  async sendWithEffect(
    params: SendMessageParams & { message_effect_id: string },
  ): Promise<{ message: TelegramMessage; effectApplied: boolean }> {
    try {
      return { message: await this.sendMessage(params), effectApplied: true };
    } catch {
      const { message_effect_id: _dropped, ...plain } = params;
      return { message: await this.sendMessage(plain), effectApplied: false };
    }
  }

  editMessageText(params: EditMessageTextParams): Promise<TelegramMessage | true> {
    return this.transport.call("editMessageText", clean({ ...params }));
  }

  editMessageReplyMarkup(params: {
    chat_id: number | string;
    message_id: number;
    reply_markup?: InlineKeyboardMarkup;
  }): Promise<TelegramMessage | true> {
    return this.transport.call("editMessageReplyMarkup", clean({ ...params }));
  }

  deleteMessage(chatId: number | string, messageId: number): Promise<true> {
    return this.transport.call("deleteMessage", { chat_id: chatId, message_id: messageId });
  }

  /** A private popup for whoever tapped the button. Capped at 200 characters. */
  answerCallbackQuery(params: AnswerCallbackQueryParams): Promise<true> {
    return this.transport.call("answerCallbackQuery", clean({ ...params }));
  }

  editEphemeralMessageText(params: EditEphemeralMessageTextParams): Promise<TelegramMessage | true> {
    return this.transport.call("editEphemeralMessageText", clean({ ...params }));
  }

  deleteEphemeralMessage(params: {
    chat_id: number | string;
    receiver_user_id: number;
    ephemeral_message_id: number;
  }): Promise<true> {
    return this.transport.call("deleteEphemeralMessage", clean({ ...params }));
  }

  setMyCommands(commands: BotCommand[], scope?: BotCommandScope): Promise<true> {
    return this.transport.call("setMyCommands", clean({ commands, scope }));
  }

  /**
   * Set the button beside the message box.
   *
   * `chatId` is a **private chat**, or nothing at all for the default that applies to
   * every private chat. Groups do not have a menu button, and Telegram rejects a group
   * id here with `Bad Request: invalid chat_id specified` — a message that reads like
   * the id is wrong when the id is fine and the method is the wrong one. That cost a
   * production registration on 10 Sep 2026: `getChat` accepted the same id happily,
   * and only `getChatMenuButton` on a private chat versus the group told the two
   * apart.
   *
   * Rejected here rather than at the API, because a 400 from Telegram arrives in the
   * middle of a sequence of calls and takes everything after it down with it.
   */
  setChatMenuButton(menuButton: MenuButton, chatId?: number): Promise<true> {
    if (chatId !== undefined && chatId < 0) {
      throw new Error(
        `setChatMenuButton takes a private chat id; ${chatId} is a group or channel, ` +
          "which has no menu button. Omit the chat id to set the default for all " +
          "private chats.",
      );
    }

    return this.transport.call(
      "setChatMenuButton",
      clean({ chat_id: chatId, menu_button: menuButton }),
    );
  }

  /**
   * A link that lets somebody join the group.
   *
   * `createChatInviteLink`, never `exportChatInviteLink`. The latter reads like the
   * gentler of the two and is the opposite: it regenerates the group's *primary*
   * link and revokes the old one, so anybody holding a copy — in the WhatsApp group
   * this league is migrating from, for instance — silently finds it dead. This one
   * adds a link and touches nothing that already exists.
   *
   * Needs the bot to be an admin with invite rights, which it already is because it
   * pins the weekly poll.
   */
  createChatInviteLink(params: {
    chat_id: number | string;
    name?: string;
    creates_join_request?: boolean;
  }): Promise<{ invite_link: string }> {
    return this.transport.call("createChatInviteLink", clean({ ...params }));
  }

  setWebhook(params: SetWebhookParams): Promise<true> {
    return this.transport.call("setWebhook", clean({ ...params }));
  }

  setMessageReaction(
    chatId: number | string,
    messageId: number,
    emoji: string | null,
  ): Promise<true> {
    return this.transport.call("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: emoji ? [{ type: "emoji", emoji }] : [],
    });
  }

  pinChatMessage(chatId: number | string, messageId: number): Promise<true> {
    return this.transport.call("pinChatMessage", {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: true,
    });
  }

  /**
   * Sends a message into a group that only `receiverUserId` can see. Falls back to
   * nothing clever: if the API rejects it, the caller decides what to do.
   */
  sendEphemeral(
    chatId: number | string,
    receiverUserId: number,
    text: string,
    options: {
      replyMarkup?: InlineKeyboardMarkup;
      callbackQueryId?: string;
      replaceCallbackQueryMessage?: boolean;
      parseMode?: SendMessageParams["parse_mode"];
    } = {},
  ): Promise<TelegramMessage> {
    return this.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: options.parseMode ?? "HTML",
      reply_markup: options.replyMarkup,
      ephemeral_message_parameters: {
        receiver_user_id: receiverUserId,
        callback_query_id: options.callbackQueryId,
        replace_callback_query_message: options.replaceCallbackQueryMessage,
      },
    });
  }
}

/** Records every call instead of making one. The backbone of the bot's tests. */
export class RecordingTransport implements TelegramTransport {
  readonly calls: { method: string; params: Record<string, unknown> }[] = [];
  private readonly failures = new Map<string, Error>();

  constructor(private readonly responses: Record<string, unknown> = {}) {}

  /** Answer one method with a specific payload, after construction. */
  reply(method: string, value: unknown): this {
    this.responses[method] = value;
    return this;
  }

  /**
   * Make one method throw.
   *
   * Half the interesting behaviour in the bot is what it does when Telegram says no —
   * a missing admin right, a message that cannot be edited, a blocked user — and
   * without this there was no way to reach any of those branches from a test.
   */
  fail(method: string, error: Error): this {
    this.failures.set(method, error);
    return this;
  }

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    this.calls.push({ method, params });

    const failure = this.failures.get(method);
    if (failure) throw failure;

    const canned = this.responses[method];
    if (canned !== undefined) return canned as T;
    return { message_id: this.calls.length, chat: { id: 0, type: "group" }, date: 0 } as T;
  }

  callsTo(method: string) {
    return this.calls.filter((c) => c.method === method);
  }

  lastCallTo(method: string) {
    return this.callsTo(method).at(-1);
  }
}

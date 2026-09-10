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

  setChatMenuButton(menuButton: MenuButton, chatId?: number): Promise<true> {
    return this.transport.call(
      "setChatMenuButton",
      clean({ chat_id: chatId, menu_button: menuButton }),
    );
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

  constructor(private readonly responses: Record<string, unknown> = {}) {}

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    this.calls.push({ method, params });
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

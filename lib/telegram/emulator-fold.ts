import type { InlineKeyboardButton } from "./types";

/**
 * Turns the emulator outbox back into a chat.
 *
 * The outbox is a log of API calls, not of messages: an edit is a separate row from
 * the message it edits, and a delete is a row too. Replaying them in order is what
 * reproduces what a real Telegram client would show — including the two behaviours
 * that are otherwise impossible to see locally: a message that rewrites itself in
 * place, and a message only one person in the group can see.
 */

export interface EmulatorRow {
  id: number;
  method: string;
  params: Record<string, unknown>;
  chat_id: number | null;
  receiver_user_id: number | null;
  target_message_id: number | null;
  created_at: string;
}

export interface RenderedMessage {
  id: number;
  chatId: number | null;
  kind: "text" | "photo";
  text: string;
  keyboard: InlineKeyboardButton[][];
  /** Null for a normal message; a user id when only that person may see it. */
  ephemeralFor: number | null;
  createdAt: string;
  /** Set when the message was rewritten after it was first sent. */
  editedAt: string | null;
  /** Emoji the bot reacted with, if any. */
  reaction: string | null;
  pinned: boolean;
  /** A `data:` URL when the picture was small enough to keep, a note when it was not. */
  photoNote?: string;
}

/** Toasts and modals are not messages, but they are worth showing in the emulator. */
export interface RenderedAlert {
  id: number;
  text: string;
  modal: boolean;
  createdAt: string;
}

export interface EmulatorView {
  messages: RenderedMessage[];
  alerts: RenderedAlert[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function keyboardOf(params: Record<string, unknown>): InlineKeyboardButton[][] {
  const markup = params.reply_markup as { inline_keyboard?: InlineKeyboardButton[][] } | undefined;
  return markup?.inline_keyboard ?? [];
}

function receiverOf(params: Record<string, unknown>): number | null {
  const ephemeral = params.ephemeral_message_parameters as
    | { receiver_user_id?: number }
    | undefined;
  return typeof ephemeral?.receiver_user_id === "number" ? ephemeral.receiver_user_id : null;
}

export function foldEmulator(rows: EmulatorRow[]): EmulatorView {
  const byId = new Map<number, RenderedMessage>();
  const order: number[] = [];
  const alerts: RenderedAlert[] = [];

  // Rows are applied oldest first, so a later edit wins over the original text.
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const params = row.params ?? {};

    switch (row.method) {
      case "sendMessage":
      case "sendPhoto": {
        const message: RenderedMessage = {
          id: row.id,
          chatId: row.chat_id,
          kind: row.method === "sendPhoto" ? "photo" : "text",
          text: str(params.text ?? params.caption),
          keyboard: keyboardOf(params),
          ephemeralFor: receiverOf(params),
          createdAt: row.created_at,
          editedAt: null,
          reaction: null,
          pinned: false,
          photoNote: row.method === "sendPhoto" ? str(params.photo) : undefined,
        };
        byId.set(row.id, message);
        order.push(row.id);
        break;
      }

      case "editMessageText":
      case "editEphemeralMessageText": {
        const target = row.target_message_id;
        const existing = target === null ? undefined : byId.get(target);
        if (!existing) break;
        existing.text = str(params.text);
        existing.keyboard = keyboardOf(params);
        existing.editedAt = row.created_at;
        break;
      }

      case "editMessageReplyMarkup": {
        const existing = row.target_message_id === null ? undefined : byId.get(row.target_message_id);
        if (!existing) break;
        existing.keyboard = keyboardOf(params);
        existing.editedAt = row.created_at;
        break;
      }

      case "deleteMessage":
      case "deleteEphemeralMessage": {
        if (row.target_message_id !== null) byId.delete(row.target_message_id);
        break;
      }

      case "setMessageReaction": {
        const existing = row.target_message_id === null ? undefined : byId.get(row.target_message_id);
        if (!existing) break;
        const reactions = params.reaction as { emoji?: string }[] | undefined;
        existing.reaction = reactions?.[0]?.emoji ?? null;
        break;
      }

      case "pinChatMessage": {
        const existing = row.target_message_id === null ? undefined : byId.get(row.target_message_id);
        if (existing) existing.pinned = true;
        break;
      }

      case "answerCallbackQuery": {
        const text = str(params.text);
        if (text) {
          alerts.push({
            id: row.id,
            text,
            modal: params.show_alert === true,
            createdAt: row.created_at,
          });
        }
        break;
      }

      default:
        break;
    }
  }

  return {
    messages: order.map((id) => byId.get(id)).filter((m): m is RenderedMessage => Boolean(m)),
    alerts,
  };
}

/**
 * What one person would actually see. An ephemeral message addressed to somebody else
 * is invisible, exactly as it would be in the real group.
 */
/**
 * What one person can actually see.
 *
 * Two kinds of privacy, and the emulator has to honour both or "viewing as somebody"
 * means nothing. An ephemeral message sits in the group but is addressed to one
 * person. A direct message is in a different chat entirely — and showing everybody's
 * DMs to whoever is reading made the post-match questionnaire look like a public
 * interrogation, which is the opposite of the decision it represents.
 *
 * With no group chat id given this falls back to the old behaviour: ephemeral
 * filtering only, every chat shown. That is what a dev poking at the outbox wants;
 * the demo passes the id because it is trying to show one person's experience.
 */
export function visibleTo(
  messages: RenderedMessage[],
  viewerId: number | null,
  options: { groupChatId?: number; viewerPrivateChatId?: number | null } = {},
): RenderedMessage[] {
  return messages.filter((message) => {
    if (message.ephemeralFor !== null && message.ephemeralFor !== viewerId) return false;

    if (options.groupChatId === undefined) return true;
    if (message.chatId === null || message.chatId === options.groupChatId) return true;

    // Somebody's private chat. Only theirs.
    return message.chatId === options.viewerPrivateChatId;
  });
}

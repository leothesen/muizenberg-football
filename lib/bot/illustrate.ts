import type { ReactElement } from "react";
import type { TelegramClient } from "@/lib/telegram/client";
import type { InlineKeyboardMarkup, TelegramMessage } from "@/lib/telegram/types";
import type { ImageSize } from "@/lib/og/layout";

/**
 * Sending a picture, but never at the cost of the message.
 *
 * Rendering can fail — a font fetch times out, a name contains something Satori
 * cannot shape, the function runs out of memory on a cold start. None of those are
 * reasons for the group to hear nothing about the game, so every illustrated message
 * carries the text it would have sent anyway and falls back to it.
 *
 * Telegram caps a photo caption at 1024 characters, so the caption is a short version
 * and the fallback is the long one. Passing the long text as a caption would fail at
 * exactly the moments the message has the most to say.
 */

export const CAPTION_LIMIT = 1024;

export interface IllustratedMessage {
  chatId: number | string;
  /** What to send if the image cannot be made. */
  text: string;
  /** What to put under the picture. Trimmed to Telegram's caption limit. */
  caption?: string;
  replyMarkup?: InlineKeyboardMarkup;
  /** Set to send the whole thing so only this person can see it. */
  receiverUserId?: number;
}

export interface Illustration {
  element: ReactElement;
  size: ImageSize;
}

export interface IllustrateDeps {
  client: TelegramClient;
  render: (element: ReactElement, size: ImageSize) => Promise<Uint8Array>;
  /** Reported rather than thrown: a missing picture is not a failed message. */
  onRenderError?: (error: unknown) => void;
}

export interface IllustratedResult {
  message: TelegramMessage;
  illustrated: boolean;
}

/**
 * Captions have no HTML unless we say so, and the text versions are already HTML, so
 * both go out as HTML and the same escaping rules hold either way.
 */
export async function sendIllustrated(
  deps: IllustrateDeps,
  message: IllustratedMessage,
  illustration: Illustration,
): Promise<IllustratedResult> {
  const ephemeral = message.receiverUserId
    ? { receiver_user_id: message.receiverUserId }
    : undefined;

  try {
    const photo = await deps.render(illustration.element, illustration.size);
    const caption = captionFor(message.text, message.caption);

    const sent = await deps.client.sendPhoto({
      chat_id: message.chatId,
      photo,
      caption: caption.text,
      parse_mode: caption.html ? "HTML" : undefined,
      reply_markup: message.replyMarkup,
      ephemeral_message_parameters: ephemeral,
    });

    return { message: sent, illustrated: true };
  } catch (error) {
    deps.onRenderError?.(error);

    const sent = await deps.client.sendMessage({
      chat_id: message.chatId,
      text: message.text,
      parse_mode: "HTML",
      reply_markup: message.replyMarkup,
      ephemeral_message_parameters: ephemeral,
    });

    return { message: sent, illustrated: false };
  }
}

export interface Caption {
  text: string;
  /** False means it is sent with no parse_mode, so any stray angle bracket is safe. */
  html: boolean;
}

/**
 * Choosing a caption.
 *
 * The tempting version of this — truncate the HTML message to 1024 characters — is
 * wrong in a way that only shows up on the busiest weeks: cutting HTML at a fixed
 * length leaves a tag unclosed, and Telegram rejects the whole message rather than
 * showing a short caption. So a caption is either something short we wrote on
 * purpose, or the message stripped back to plain text where truncation cannot break
 * anything.
 */
export function captionFor(text: string, caption?: string, limit = CAPTION_LIMIT): Caption {
  if (caption !== undefined && caption.length <= limit) {
    return { text: caption, html: true };
  }

  const source = caption ?? text;
  const plain = stripHtml(source);
  if (plain.length <= limit) return { text: plain, html: false };

  return { text: `${plain.slice(0, limit - 1).trimEnd()}…`, html: false };
}

/** Tags out, entities back to the characters they stand for. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

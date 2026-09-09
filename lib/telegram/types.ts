/**
 * The slice of the Telegram Bot API this project actually uses.
 *
 * Hand-written rather than generated, and deliberately narrow: every field here was
 * checked against the reference (see docs/TELEGRAM_API.md) on 9 Sep 2026. Adding a
 * field means checking it, not guessing it.
 */

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
  reply_to_message?: TelegramMessage;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  chat_instance: string;
  data?: string;
}

export interface TelegramInlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
  offset: string;
}

export type ChatMemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

export interface TelegramChatMember {
  status: ChatMemberStatus;
  user: TelegramUser;
}

export interface TelegramChatMemberUpdated {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
  my_chat_member?: TelegramChatMemberUpdated;
  chat_member?: TelegramChatMemberUpdated;
}

/** Statuses that mean the person is currently in the chat. */
export const PRESENT_STATUSES: ReadonlySet<ChatMemberStatus> = new Set([
  "creator",
  "administrator",
  "member",
  "restricted",
]);

export interface WebAppInfo {
  url: string;
}

export interface LoginUrl {
  url: string;
  forward_text?: string;
  bot_username?: string;
  request_write_access?: boolean;
}

export interface CopyTextButton {
  text: string;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: WebAppInfo;
  login_url?: LoginUrl;
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
  copy_text?: CopyTextButton;
  /** Renders the button greyed out and unpressable. */
  disabled?: Record<string, never>;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

/**
 * Makes a message visible to exactly one person inside a group chat. This is the
 * mechanism behind every "only you can see this" moment in the product.
 */
export interface EphemeralMessageParameters {
  receiver_user_id: number;
  callback_query_id?: string;
  /** Must be false for callbacks that came from an ephemeral message. */
  replace_callback_query_message?: boolean;
}

export type ParseMode = "HTML" | "MarkdownV2";

export interface SendMessageParams {
  chat_id: number | string;
  text: string;
  parse_mode?: ParseMode;
  reply_markup?: InlineKeyboardMarkup;
  ephemeral_message_parameters?: EphemeralMessageParameters;
  disable_notification?: boolean;
  protect_content?: boolean;
  message_effect_id?: string;
  link_preview_options?: { is_disabled?: boolean };
}

export interface SendPhotoParams {
  chat_id: number | string;
  /** A file_id, a URL, or raw bytes to upload. */
  photo: string | Uint8Array;
  caption?: string;
  parse_mode?: ParseMode;
  reply_markup?: InlineKeyboardMarkup;
  ephemeral_message_parameters?: EphemeralMessageParameters;
  disable_notification?: boolean;
}

export interface EditMessageTextParams {
  chat_id: number | string;
  message_id: number;
  text: string;
  parse_mode?: ParseMode;
  reply_markup?: InlineKeyboardMarkup;
  link_preview_options?: { is_disabled?: boolean };
}

export interface EditEphemeralMessageTextParams {
  chat_id: number | string;
  receiver_user_id: number;
  ephemeral_message_id: number;
  text: string;
  parse_mode?: ParseMode;
  reply_markup?: InlineKeyboardMarkup;
}

export interface AnswerCallbackQueryParams {
  callback_query_id: string;
  /** 0-200 characters. */
  text?: string;
  /** Show a modal rather than a toast. Private to whoever tapped. */
  show_alert?: boolean;
  url?: string;
  cache_time?: number;
}

export interface BotCommand {
  command: string;
  description: string;
}

export type BotCommandScope =
  | { type: "default" }
  | { type: "all_private_chats" }
  | { type: "all_group_chats" }
  | { type: "all_chat_administrators" }
  | { type: "chat"; chat_id: number | string };

export type MenuButton =
  | { type: "default" }
  | { type: "commands" }
  | { type: "web_app"; text: string; web_app: WebAppInfo };

export interface SetWebhookParams {
  url: string;
  secret_token?: string;
  allowed_updates?: string[];
  drop_pending_updates?: boolean;
  max_connections?: number;
}

import type { TelegramClient } from "@/lib/telegram/client";
import type { BotCommand } from "@/lib/telegram/types";

/**
 * What the bot tells Telegram about itself.
 *
 * Two scopes, because the useful commands differ. In the group the commands are the
 * ones worth shouting about; in a private chat they are the personal ones. Telegram
 * shows whichever scope matches the chat you are typing in.
 */

export const GROUP_COMMANDS: BotCommand[] = [
  { command: "next", description: "Who's playing next game" },
  { command: "where", description: "Where it is — or move it somewhere else" },
  { command: "game", description: "Put a game on: /game sat 4pm" },
  { command: "bring", description: "Get a link to invite a mate" },
  { command: "off", description: "Raining? Say so and let everyone decide" },
  { command: "table", description: "The season table" },
  { command: "leaders", description: "Golden Boot, Nutmeg King and the rest" },
  { command: "records", description: "The hall of fame" },
  { command: "me", description: "Your player card, just for you" },
  { command: "name", description: "Be called what you want: /name Daniel G." },
  { command: "emoji", description: "The picture beside your name: /emoji 🦖" },
  { command: "help", description: "What I can do" },
];

export const PRIVATE_COMMANDS: BotCommand[] = [
  { command: "me", description: "Your player card" },
  { command: "name", description: "Be called what you want: /name Daniel G." },
  { command: "emoji", description: "The picture beside your name: /emoji 🦖" },
  { command: "table", description: "The season table" },
  { command: "leaders", description: "Season leaderboards" },
  { command: "records", description: "The hall of fame" },
  { command: "next", description: "The next fixture" },
  { command: "where", description: "Where the next game is" },
  { command: "help", description: "What I can do" },
];

/**
 * The updates the webhook asks for.
 *
 * `chat_member` is the one that matters and the one that is easy to lose: it is not
 * sent unless it is named here, and without it somebody joining by invite link is
 * never noticed — which would quietly break the single most important promise this
 * product makes, that joining the group is joining the league.
 */
export const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "callback_query",
  "inline_query",
  "chat_member",
  "my_chat_member",
] as const;

/** The Mini App lives at /app; the menu button is how most people will ever find it. */
export function miniAppUrl(siteUrl: string): string {
  return new URL("/app", siteUrl).toString();
}

export function webhookUrl(siteUrl: string): string {
  return new URL("/api/telegram/webhook", siteUrl).toString();
}

/**
 * Push the command lists to Telegram.
 *
 * The menu a player sees when they type "/" is a snapshot Telegram holds, not
 * something it reads from this repository — so it changes only when `setMyCommands`
 * is called, and nothing about deploying calls it. That made keeping the menu honest
 * a manual step somebody had to remember, and nobody did: on 16 Sep 2026 the group's
 * menu was still the six commands from the very first version of the list, so
 * /where, /off, /game and /bring had shipped months earlier and never appeared.
 *
 * Run from the daily keepalive as well as from registration, so the worst the menu
 * can ever be is a day behind the code. Every call is a "set" rather than an "add",
 * which is what makes running it daily cost nothing.
 */
export async function syncCommands(client: TelegramClient): Promise<void> {
  await client.setMyCommands(GROUP_COMMANDS, { type: "all_group_chats" });
  await client.setMyCommands(PRIVATE_COMMANDS, { type: "all_private_chats" });
}

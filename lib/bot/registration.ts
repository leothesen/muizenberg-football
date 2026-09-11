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
  { command: "bring", description: "Bringing a mate who isn't here: /bring Dave" },
  { command: "off", description: "Raining? Say so and let everyone decide" },
  { command: "table", description: "The season table" },
  { command: "leaders", description: "Golden Boot, Nutmeg King and the rest" },
  { command: "records", description: "The hall of fame" },
  { command: "me", description: "Your player card, just for you" },
  { command: "help", description: "What I can do" },
];

export const PRIVATE_COMMANDS: BotCommand[] = [
  { command: "me", description: "Your player card" },
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

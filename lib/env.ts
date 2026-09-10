/**
 * Environment access.
 *
 * Read through functions rather than module-level constants: Next inlines constants
 * at build time, which silently bakes a build machine's values into the bundle. A
 * missing variable should fail loudly at the moment it is needed, naming itself.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example for what it should hold.`,
    );
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/**
 * True when the bot should talk to the local emulator instead of Telegram. Also the
 * default whenever no bot token is configured, so a fresh clone runs without one.
 */
export function usingTelegramEmulator(): boolean {
  if (process.env.TELEGRAM_EMULATOR_ENABLED === "false") return false;
  if (process.env.TELEGRAM_EMULATOR_ENABLED === "true") return true;
  return !optionalEnv("TELEGRAM_BOT_TOKEN");
}

export function leagueChatId(): number | undefined {
  const raw = optionalEnv("TELEGRAM_LEAGUE_CHAT_ID");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function siteUrl(): string {
  return optionalEnv("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";
}

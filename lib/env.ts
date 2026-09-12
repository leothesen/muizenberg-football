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

/**
 * The link that puts somebody in the group.
 *
 * Deliberately public — it is printed on the front page, because joining the Telegram
 * group is the entire sign-up and there is nothing else to click. Anybody who has the
 * link can join, which is the intended behaviour and also the whole risk: to shut it
 * off, revoke the invite in Telegram (Group → Invite Links), not here.
 *
 * Overridable by environment so a revoked link can be replaced on Vercel without a
 * deploy, with the current one as the default so local and preview builds work.
 */
export function inviteUrl(): string {
  return optionalEnv("NEXT_PUBLIC_TELEGRAM_INVITE_URL") ?? "https://t.me/+9DNiCbUDw9U5YzBk";
}

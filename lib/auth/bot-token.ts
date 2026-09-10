import { devToolsEnabled } from "@/lib/dev-guard";
import { optionalEnv } from "@/lib/env";

/**
 * Which token Mini App signatures are checked against.
 *
 * The awkward bit: locally there is no bot token at all — that absence is what
 * selects the emulator — so without something here the entire Mini App login could
 * only ever be exercised in production, which is the worst possible place to find out
 * it does not work.
 *
 * The answer is a stand-in token, never a skipped check. Local `initData` is signed
 * and verified with exactly the same algorithm; only the key differs. Forging it
 * locally is trivial, which is fine and is the point — it is the same trust as the
 * emulator itself, and it is unreachable the moment either a real token exists or
 * NODE_ENV is production.
 */

export const DEV_BOT_TOKEN = "0:muizenberg-local-emulator";

export function miniAppBotToken(): string | null {
  const real = optionalEnv("TELEGRAM_BOT_TOKEN");
  if (real) return real;

  if (!devToolsEnabled()) return null;
  return optionalEnv("TELEGRAM_DEV_BOT_TOKEN") ?? DEV_BOT_TOKEN;
}

/** True when the token in use is the local stand-in rather than a real one. */
export function usingDevBotToken(): boolean {
  return !optionalEnv("TELEGRAM_BOT_TOKEN") && devToolsEnabled();
}

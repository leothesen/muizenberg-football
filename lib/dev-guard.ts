import { usingTelegramEmulator } from "@/lib/env";

/**
 * Development-only surfaces.
 *
 * The emulator can drive the real handlers, so it must never be reachable on a
 * deployment that talks to a real Telegram group. Two independent conditions have to
 * hold, not one: a production build, or a configured bot token, disables it.
 */
export function devToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && usingTelegramEmulator();
}

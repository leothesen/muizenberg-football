import { optionalEnv, usingTelegramEmulator } from "@/lib/env";
import { HttpTelegramTransport, TelegramClient } from "./client";
import { EmulatorTransport } from "./emulator-transport";

/**
 * Picks the transport. With no bot token the emulator takes over, so a fresh clone
 * runs the whole bot without anybody having to talk to BotFather first.
 */
export function telegramClient(): TelegramClient {
  if (usingTelegramEmulator()) {
    return new TelegramClient(new EmulatorTransport());
  }

  return new TelegramClient(
    new HttpTelegramTransport({
      token: optionalEnv("TELEGRAM_BOT_TOKEN")!,
      useTestEnvironment: optionalEnv("TELEGRAM_USE_TEST_API") === "true",
    }),
  );
}

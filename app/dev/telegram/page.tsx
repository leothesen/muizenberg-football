import { notFound } from "next/navigation";
import { devToolsEnabled } from "@/lib/dev-guard";
import { leagueChatId } from "@/lib/env";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  players as playersTable,
  telegramEmulatorMessages,
} from "@/lib/db/schema";
import { foldEmulator, type EmulatorRow } from "@/lib/telegram/emulator-fold";
import { Emulator } from "./emulator";

export const dynamic = "force-dynamic";

export const metadata = { title: "Telegram emulator" };

/** Matches the chat id the development seed uses for the league group. */
const SEEDED_GROUP_CHAT_ID = -1001234567890;

export default async function TelegramEmulatorPage() {
  if (!devToolsEnabled()) notFound();

  const chatId = leagueChatId() ?? SEEDED_GROUP_CHAT_ID;

  const [players, rows] = await Promise.all([
    db()
      .select({
        id: playersTable.id,
        telegram_user_id: playersTable.telegram_user_id,
        display_name: playersTable.display_name,
        emoji: playersTable.emoji,
        private_chat_id: playersTable.private_chat_id,
      })
      .from(playersTable)
      .orderBy(asc(playersTable.display_name)),
    db()
      .select()
      .from(telegramEmulatorMessages)
      .orderBy(asc(telegramEmulatorMessages.id))
      .limit(500),
  ]);

  const view = foldEmulator(rows as unknown as EmulatorRow[]);

  return (
    <Emulator
      chatId={chatId}
      // Guests are left out: the emulator works by letting you act as somebody, and a
      // guest has no Telegram account to act as. They still appear in squads and on
      // team sheets, which is the only place they were ever meant to.
      players={players
        .filter((p) => p.telegram_user_id !== null)
        .map((p) => ({
          id: p.id,
          telegramUserId: p.telegram_user_id!,
          displayName: p.display_name,
          emoji: p.emoji,
          privateChatId: p.private_chat_id,
        }))}
      messages={view.messages}
      alerts={view.alerts}
    />
  );
}

import { notFound } from "next/navigation";
import { devToolsEnabled } from "@/lib/dev-guard";
import { leagueChatId } from "@/lib/env";
import { db } from "@/lib/supabase";
import { foldEmulator, type EmulatorRow } from "@/lib/telegram/emulator-fold";
import { Emulator } from "./emulator";

export const dynamic = "force-dynamic";

export const metadata = { title: "Telegram emulator" };

/** Matches the chat id the development seed uses for the league group. */
const SEEDED_GROUP_CHAT_ID = -1001234567890;

export default async function TelegramEmulatorPage() {
  if (!devToolsEnabled()) notFound();

  const chatId = leagueChatId() ?? SEEDED_GROUP_CHAT_ID;

  const [{ data: players }, { data: rows }] = await Promise.all([
    db()
      .from("players")
      .select("id, telegram_user_id, display_name, emoji, private_chat_id")
      .order("display_name"),
    db()
      .from("telegram_emulator_messages")
      .select("*")
      .order("id", { ascending: true })
      .limit(500),
  ]);

  const view = foldEmulator((rows ?? []) as EmulatorRow[]);

  return (
    <Emulator
      chatId={chatId}
      players={(players ?? []).map((p) => ({
        id: p.id,
        telegramUserId: p.telegram_user_id,
        displayName: p.display_name,
        emoji: p.emoji,
        privateChatId: p.private_chat_id,
      }))}
      messages={view.messages}
      alerts={view.alerts}
    />
  );
}

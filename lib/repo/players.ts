import type { TelegramUser } from "@/lib/telegram/types";
import { db } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { type PlayerRow } from "./mappers";

type PlayerUpdate = Database["public"]["Tables"]["players"]["Update"];

/**
 * Players.
 *
 * Enrolment is a side effect of interacting with the bot, never a form. Any handler
 * that has a Telegram user in hand can call `ensurePlayer` and get a league member
 * back, creating them the first time.
 */

export async function findPlayerByTelegramId(telegramUserId: number): Promise<PlayerRow | null> {
  const { data, error } = await db()
    .from("players")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export interface EnsurePlayerResult {
  player: PlayerRow;
  /** True only on the call that actually created them — drives the welcome. */
  isNew: boolean;
}

export async function ensurePlayer(
  user: TelegramUser,
  options: { privateChatId?: number } = {},
): Promise<EnsurePlayerResult> {
  const existing = await findPlayerByTelegramId(user.id);

  if (existing) {
    const patch = pendingPatch(existing, user, options.privateChatId);
    if (!patch) return { player: existing, isNew: false };

    const { data, error } = await db()
      .from("players")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw error;
    return { player: data, isNew: false };
  }

  const { data, error } = await db()
    .from("players")
    .insert({
      telegram_user_id: user.id,
      telegram_username: user.username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      display_name: user.first_name,
      private_chat_id: options.privateChatId ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // Two updates for the same new person can race (a join event and their first
    // tap). The unique index is the arbiter; whoever loses just reads the winner.
    if (error.code === "23505") {
      const raced = await findPlayerByTelegramId(user.id);
      if (raced) return { player: raced, isNew: false };
    }
    throw error;
  }

  return { player: data, isNew: true };
}

/**
 * People rename themselves on Telegram. Keep the mutable details fresh, but never
 * overwrite a display_name the player has deliberately chosen.
 */
function pendingPatch(
  existing: PlayerRow,
  user: TelegramUser,
  privateChatId?: number,
): PlayerUpdate | null {
  const patch: PlayerUpdate = {};

  if ((user.username ?? null) !== existing.telegram_username) {
    patch.telegram_username = user.username ?? null;
  }
  if (user.first_name !== existing.first_name) {
    patch.first_name = user.first_name;
  }
  if (privateChatId && privateChatId !== existing.private_chat_id) {
    patch.private_chat_id = privateChatId;
  }
  if (!existing.is_active) {
    patch.is_active = true;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export async function setDisplayName(playerId: string, displayName: string): Promise<void> {
  const { error } = await db()
    .from("players")
    .update({ display_name: displayName })
    .eq("id", playerId);
  if (error) throw error;
}

export async function setEmoji(playerId: string, emoji: string): Promise<void> {
  const { error } = await db().from("players").update({ emoji }).eq("id", playerId);
  if (error) throw error;
}

export async function deactivatePlayer(telegramUserId: number): Promise<void> {
  const { error } = await db()
    .from("players")
    .update({ is_active: false })
    .eq("telegram_user_id", telegramUserId);
  if (error) throw error;
}

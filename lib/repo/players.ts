import { and, eq } from "drizzle-orm";
import type { TelegramUser } from "@/lib/telegram/types";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { type PlayerRow } from "./mappers";

/**
 * Players.
 *
 * Enrolment is a side effect of interacting with the bot, never a form. Any handler
 * that has a Telegram user in hand can call `ensurePlayer` and get a league member
 * back, creating them the first time.
 */

type PlayerPatch = Partial<typeof players.$inferInsert>;

/**
 * Postgres returns `numeric` as a string, because a double cannot hold every value
 * the type can. PostgREST used to coerce it on the way out; Drizzle hands back what
 * the driver gives it, so the coercion moves here. Ratings are compared and averaged
 * all over the domain, and "72.50" sorts before "8.00".
 */
function toRow(row: typeof players.$inferSelect): PlayerRow {
  return { ...row, rating: Number(row.rating) } as PlayerRow;
}

export async function findPlayerByTelegramId(
  telegramUserId: number,
): Promise<PlayerRow | null> {
  const [row] = await db()
    .select()
    .from(players)
    .where(eq(players.telegram_user_id, telegramUserId))
    .limit(1);

  return row ? toRow(row) : null;
}

export interface EnsurePlayerResult {
  player: PlayerRow;
  /** True only on the call that actually created them — drives the welcome. */
  isNew: boolean;
}

/**
 * Add somebody who is not on Telegram.
 *
 * Deliberately not idempotent on the name. Two different people called Dave is a
 * likelier situation in a football group than one person being added twice, and the
 * cost of the two mistakes is not symmetric: a duplicate is visible on the team sheet
 * and somebody will say so, whereas silently merging two Daves means one of them is
 * not counted and nobody finds out until eleven people show up for a nine-a-side.
 */
export async function addGuest(params: {
  displayName: string;
  invitedBy: string;
  emoji?: string;
}): Promise<PlayerRow> {
  const [created] = await db()
    .insert(players)
    .values({
      telegram_user_id: null,
      first_name: params.displayName,
      display_name: params.displayName,
      is_guest: true,
      invited_by: params.invitedBy,
      emoji: params.emoji ?? "👤",
    })
    .returning();

  return toRow(created!);
}

/** Guests somebody has brought to a fixture, for showing who is whose. */
export async function guestsInvitedBy(playerId: string): Promise<PlayerRow[]> {
  const rows = await db()
    .select()
    .from(players)
    .where(and(eq(players.invited_by, playerId), eq(players.is_guest, true)));

  return rows.map(toRow);
}

export async function ensurePlayer(
  user: TelegramUser,
  options: { privateChatId?: number } = {},
): Promise<EnsurePlayerResult> {
  const existing = await findPlayerByTelegramId(user.id);

  if (existing) {
    const patch = pendingPatch(existing, user, options.privateChatId);
    if (!patch) return { player: existing, isNew: false };

    const [updated] = await db()
      .update(players)
      .set(patch)
      .where(eq(players.id, existing.id))
      .returning();

    return { player: toRow(updated!), isNew: false };
  }

  // Two updates for the same new person can race (a join event and their first
  // tap). The unique index is the arbiter; whoever loses just reads the winner.
  // `onConflictDoNothing` turns the loser's insert into zero rows rather than an
  // error, which is the same outcome the old 23505 handler produced with one fewer
  // round trip.
  const [created] = await db()
    .insert(players)
    .values({
      telegram_user_id: user.id,
      telegram_username: user.username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      display_name: user.first_name,
      private_chat_id: options.privateChatId ?? null,
    })
    .onConflictDoNothing({ target: players.telegram_user_id })
    .returning();

  if (created) return { player: toRow(created), isNew: true };

  const raced = await findPlayerByTelegramId(user.id);
  if (raced) return { player: raced, isNew: false };

  throw new Error(
    `could not enrol telegram user ${user.id}: insert was refused but no row exists`,
  );
}

/**
 * People rename themselves on Telegram. Keep the mutable details fresh, but never
 * overwrite a display_name the player has deliberately chosen.
 */
function pendingPatch(
  existing: PlayerRow,
  user: TelegramUser,
  privateChatId?: number,
): PlayerPatch | null {
  const patch: PlayerPatch = {};

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

export async function setDisplayName(
  playerId: string,
  displayName: string,
): Promise<void> {
  await db()
    .update(players)
    .set({ display_name: displayName })
    .where(eq(players.id, playerId));
}

export async function setEmoji(playerId: string, emoji: string): Promise<void> {
  await db().update(players).set({ emoji }).where(eq(players.id, playerId));
}

export async function deactivatePlayer(telegramUserId: number): Promise<void> {
  await db()
    .update(players)
    .set({ is_active: false })
    .where(eq(players.telegram_user_id, telegramUserId));
}

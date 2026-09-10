import { db } from "@/lib/supabase";

/**
 * Webhook idempotency.
 *
 * Telegram redelivers an update if our webhook is slow or errors, and a double-tapped
 * button would otherwise double-count a goal. Every update id is claimed exactly once;
 * the unique primary key is what makes the claim atomic even with two instances racing.
 */
export async function claimUpdate(updateId: number, kind: string): Promise<boolean> {
  const { error } = await db().from("telegram_updates").insert({ update_id: updateId, kind });

  if (!error) return true;
  // 23505 is a duplicate key: somebody already has this update.
  if (error.code === "23505") return false;
  throw error;
}

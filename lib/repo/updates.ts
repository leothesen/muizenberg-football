import { db } from "@/lib/db";
import { telegramUpdates } from "@/lib/db/schema";

/**
 * Webhook idempotency.
 *
 * Telegram redelivers an update if our webhook is slow or errors, and a double-tapped
 * button would otherwise double-count a goal. Every update id is claimed exactly once;
 * the unique primary key is what makes the claim atomic even with two instances racing.
 */
export async function claimUpdate(
  updateId: number,
  kind: string,
): Promise<boolean> {
  // `onConflictDoNothing` returns the inserted rows, so an empty array means somebody
  // else already holds this update. That is the whole check — the database decides,
  // not a read-then-write that two instances could both pass.
  const claimed = await db()
    .insert(telegramUpdates)
    .values({ update_id: updateId, kind })
    .onConflictDoNothing()
    .returning({ update_id: telegramUpdates.update_id });

  return claimed.length > 0;
}

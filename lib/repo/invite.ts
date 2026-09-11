import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { botState } from "@/lib/db/schema";

/**
 * The group's invite link, remembered.
 *
 * Created once and kept, because Telegram makes a new link every time you ask and a
 * group with forty stale invite links in its settings is somebody's afternoon to
 * clean up. Stored in bot_state rather than a column of its own: it belongs to the
 * chat, not to any fixture or player, and bot_state is exactly the drawer for a
 * single fact the bot needs to remember between requests.
 */

const KEY = "group_invite_link";

interface StoredLink {
  link: string;
  chatId: number;
}

export async function cachedInviteLink(chatId: number): Promise<string | null> {
  const [row] = await db().select().from(botState).where(eq(botState.key, KEY));
  const stored = row?.value as StoredLink | undefined;

  // The chat id is checked, not just the link: a link cached against a different
  // group would invite people to the wrong chat, which is worse than having none.
  return stored?.link && stored.chatId === chatId ? stored.link : null;
}

export async function rememberInviteLink(chatId: number, link: string): Promise<void> {
  await db()
    .insert(botState)
    .values({ key: KEY, value: { link, chatId } satisfies StoredLink })
    .onConflictDoUpdate({
      target: botState.key,
      set: { value: { link, chatId } satisfies StoredLink },
    });
}

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { botState } from "@/lib/db/schema";

/**
 * The bot's own @username, remembered.
 *
 * Needed to build `t.me/<username>?start=...`, which is the only way to hand somebody
 * a tappable link into a private chat with the bot — and a private chat is the only
 * way the bot is ever allowed to message them first.
 *
 * Stored rather than configured because configuration is exactly how this went wrong:
 * the deep link was gated on a value nothing in production ever set, so the button
 * silently stopped rendering and the failure surfaced months later as an empty match
 * report. `getMe` already knows the answer; this is the drawer it gets kept in, next
 * to the invite link, for the same reason.
 */

const KEY = "bot_username";

interface StoredIdentity {
  username: string;
}

export async function cachedBotUsername(): Promise<string | null> {
  const [row] = await db().select().from(botState).where(eq(botState.key, KEY));
  const stored = row?.value as StoredIdentity | undefined;
  return stored?.username ?? null;
}

export async function rememberBotUsername(username: string): Promise<void> {
  await db()
    .insert(botState)
    .values({ key: KEY, value: { username } satisfies StoredIdentity })
    .onConflictDoUpdate({
      target: botState.key,
      set: { value: { username } satisfies StoredIdentity },
    });
}

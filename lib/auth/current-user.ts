import "server-only";
import { cookies } from "next/headers";
import { optionalEnv, requireEnv } from "@/lib/env";
import { findPlayerByTelegramId } from "@/lib/repo/players";
import type { PlayerRow } from "@/lib/repo/mappers";
import {
  decodeSession,
  encodeSession,
  newSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  type Session,
} from "./session";

/**
 * Who is asking.
 *
 * The only two ways to become somebody here are a signed Mini App payload and a
 * signed OAuth ID token; both end at `startSession`. Nothing else in the app is
 * allowed to mint one, which is what keeps "Telegram is the auth" true rather than
 * merely intended.
 */

export function sessionSecret(): string {
  return requireEnv("SESSION_SECRET");
}

/** Secure cookies need HTTPS, which localhost does not have. */
export function cookiesAreSecure(): boolean {
  return (optionalEnv("NEXT_PUBLIC_SITE_URL") ?? "").startsWith("https://");
}

export async function readSession(): Promise<Session | null> {
  const secret = optionalEnv("SESSION_SECRET");
  if (!secret) return null;

  const jar = await cookies();
  const result = decodeSession(jar.get(SESSION_COOKIE)?.value, secret);
  return result.ok ? result.session : null;
}

export async function startSession(params: {
  playerId: string;
  telegramUserId: number;
}): Promise<void> {
  const jar = await cookies();
  jar.set(
    SESSION_COOKIE,
    encodeSession(newSession(params), sessionSecret()),
    sessionCookieOptions({ secure: cookiesAreSecure() }),
  );
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions({ secure: cookiesAreSecure() }),
    maxAge: 0,
  });
}

/**
 * The signed-in player, or null. Re-read from the database rather than trusted from
 * the cookie: a display name or rating in a three-month-old session would be stale,
 * and someone who left the group should stop being a member of the league.
 */
export async function currentPlayer(): Promise<PlayerRow | null> {
  const session = await readSession();
  if (!session) return null;

  const player = await findPlayerByTelegramId(session.telegramUserId);
  if (!player || !player.is_active) return null;

  // A session that names a different player than the Telegram id resolves to is a
  // session that has been tampered with or a player row that was replaced.
  if (player.id !== session.playerId) return null;

  return player;
}

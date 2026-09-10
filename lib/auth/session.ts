import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The session.
 *
 * Telegram proves who you are exactly once — when a Mini App hands over signed
 * `initData`, or when the OAuth flow returns a signed ID token. Neither is available
 * on an ordinary page load afterwards, so that one proof is exchanged for a session
 * of our own.
 *
 * It is a signed value, not an encrypted one, and it is not stored anywhere. That is
 * the right trade for this app: the payload is a player id and a Telegram user id,
 * both of which the holder already knows, and a database round trip per request buys
 * nothing when there is no revocation story to speak of. Signing is what matters —
 * without it the cookie would simply be a claim.
 */

export interface Session {
  playerId: string;
  telegramUserId: number;
  /** Seconds since the epoch. */
  issuedAt: number;
}

export const SESSION_COOKIE = "mzb_session";

/** A season is about right: nobody wants to log in again to check the table. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export type SessionFailure = "malformed" | "bad-signature" | "expired";

export type SessionResult =
  | { ok: true; session: Session }
  | { ok: false; reason: SessionFailure };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeSession(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeSession(
  token: string | undefined,
  secret: string,
  options: { now?: Date; maxAgeSeconds?: number } = {},
): SessionResult {
  if (!token || !secret) return { ok: false, reason: "malformed" };

  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };

  const [payload, signature] = parts as [string, string];

  const expected = sign(payload, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }

  let session: Session;
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    typeof session?.playerId !== "string" ||
    typeof session.telegramUserId !== "number" ||
    typeof session.issuedAt !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const maxAge = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  if (session.issuedAt + maxAge < now) return { ok: false, reason: "expired" };

  return { ok: true, session };
}

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax" | "none";
  path: string;
  maxAge: number;
}

/**
 * A Mini App runs inside Telegram's own webview, which is a third-party context on
 * some platforms, so its cookie needs SameSite=None — and SameSite=None is only ever
 * honoured alongside Secure. Locally there is no HTTPS, so Lax is used instead; that
 * is fine because there is no cross-site embedding on localhost either.
 */
export function sessionCookieOptions(options: { secure: boolean }): CookieOptions {
  return {
    httpOnly: true,
    secure: options.secure,
    sameSite: options.secure ? "none" : "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function newSession(params: { playerId: string; telegramUserId: number; now?: Date }): Session {
  return {
    playerId: params.playerId,
    telegramUserId: params.telegramUserId,
    issuedAt: Math.floor((params.now ?? new Date()).getTime() / 1000),
  };
}

/** For the OAuth `state` and `nonce`, which only ever need to be unguessable. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

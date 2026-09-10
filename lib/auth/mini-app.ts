import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proving that a Mini App page really was opened from inside Telegram.
 *
 * The Mini App hands the page an `initData` query string that Telegram signed with a
 * key derived from the bot token. Verifying it is the whole of our authentication:
 * there is no password anywhere in this product, and a valid `initData` is the only
 * thing that proves a Telegram user id belongs to the person holding the phone.
 *
 * Read off https://core.telegram.org/bots/webapps on 10 Sep 2026 rather than recalled,
 * because two details here are easy to get subtly and silently wrong:
 *
 *   1. The secret key is `HMAC_SHA256(key="WebAppData", data=<bot_token>)` — the
 *      constant is the *key* and the token is the *data*, which is the opposite way
 *      round from how it reads.
 *   2. Only `hash` is removed from the data-check-string. The newer `signature` field
 *      stays in. Stripping it — which several libraries do, because the Ed25519
 *      third-party flow does strip it — makes every real login fail while every test
 *      built from the same wrong assumption passes.
 */

export interface TelegramInitUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export type InitDataFailure =
  | "malformed"
  | "no-hash"
  | "bad-signature"
  | "no-user"
  | "expired";

export type InitDataResult =
  | { ok: true; user: TelegramInitUser; authDate: Date; startParam?: string }
  | { ok: false; reason: InitDataFailure };

/** Telegram suggests checking freshness but sets no window; an hour is generous. */
export const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 3600;

export function buildDataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];

  for (const [key, value] of params.entries()) {
    // Only `hash` comes out. See the note above about `signature`.
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }

  return pairs.sort().join("\n");
}

export function miniAppSecretKey(botToken: string): Buffer {
  return createHmac("sha256", "WebAppData").update(botToken).digest();
}

export function signInitData(params: URLSearchParams, botToken: string): string {
  return createHmac("sha256", miniAppSecretKey(botToken))
    .update(buildDataCheckString(params))
    .digest("hex");
}

/** Constant-time, and never throws on a wrong-length or non-hex candidate. */
export function hashesMatch(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");
  if (a.length === 0 || a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export function verifyInitData(
  initData: string,
  botToken: string,
  options: { now?: Date; maxAgeSeconds?: number } = {},
): InitDataResult {
  if (!initData || !botToken) return { ok: false, reason: "malformed" };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no-hash" };

  if (!hashesMatch(signInitData(params, botToken), hash)) {
    return { ok: false, reason: "bad-signature" };
  }

  const rawUser = params.get("user");
  if (!rawUser) return { ok: false, reason: "no-user" };

  let user: TelegramInitUser;
  try {
    user = JSON.parse(rawUser) as TelegramInitUser;
  } catch {
    return { ok: false, reason: "no-user" };
  }

  if (typeof user?.id !== "number" || typeof user.first_name !== "string") {
    return { ok: false, reason: "no-user" };
  }

  // Freshness is checked only after the signature, so an unsigned payload can never
  // reach this branch and learn anything from which error it gets back.
  const authDateSeconds = Number(params.get("auth_date"));
  if (!Number.isFinite(authDateSeconds) || authDateSeconds <= 0) {
    return { ok: false, reason: "expired" };
  }

  const authDate = new Date(authDateSeconds * 1000);
  const now = options.now ?? new Date();
  const maxAge = options.maxAgeSeconds ?? DEFAULT_INIT_DATA_MAX_AGE_SECONDS;
  const ageSeconds = (now.getTime() - authDate.getTime()) / 1000;

  // Future-dated data is as suspicious as stale data; a little clock skew is fine.
  if (ageSeconds > maxAge || ageSeconds < -60) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    user,
    authDate,
    startParam: params.get("start_param") ?? undefined,
  };
}

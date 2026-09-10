import type { IdTokenClaims, JwtResult } from "./jwt";
import type { LoginHandshake, TokenResponse } from "./oauth";
import { safeReturnTo } from "./oauth";

/**
 * What has to be true before somebody is logged in.
 *
 * Pulled out of the route so the order of the checks can be pinned by tests. The
 * order is the part that matters and the part that is easy to get wrong: `state` has
 * to be compared before the code is spent, the handshake has to be single-use even
 * when the login fails, and nothing may be trusted from the ID token until its
 * signature has been verified.
 */

export type LoginFailure =
  | "no-handshake"
  | "state-mismatch"
  | "provider-error"
  | "no-code"
  | "exchange-failed"
  | "no-id-token"
  | "no-telegram-id"
  | JwtResult extends { ok: false; reason: infer R }
    ? R
    : never;

export type LoginOutcome =
  | { ok: true; telegramUserId: number; claims: IdTokenClaims; returnTo: string }
  | { ok: false; reason: string };

export interface CompleteLoginInput {
  handshake: LoginHandshake | null;
  /** Exactly what came back on the query string. */
  returnedState: string | null;
  code: string | null;
  providerError: string | null;
  exchange: (params: { code: string; verifier: string }) => Promise<TokenResponse>;
  verify: (params: { idToken: string; nonce: string }) => Promise<JwtResult> | JwtResult;
}

export async function completeLogin(input: CompleteLoginInput): Promise<LoginOutcome> {
  if (!input.handshake) return { ok: false, reason: "no-handshake" };

  // State first. Comparing it after spending the code would mean an attacker's code
  // had already been redeemed by the time we noticed whose login this was.
  if (!input.returnedState || input.returnedState !== input.handshake.state) {
    return { ok: false, reason: "state-mismatch" };
  }

  if (input.providerError) return { ok: false, reason: "provider-error" };
  if (!input.code) return { ok: false, reason: "no-code" };

  let tokens: TokenResponse;
  try {
    tokens = await input.exchange({ code: input.code, verifier: input.handshake.verifier });
  } catch {
    return { ok: false, reason: "exchange-failed" };
  }

  if (!tokens.id_token) return { ok: false, reason: "no-id-token" };

  const verified = await input.verify({
    idToken: tokens.id_token,
    nonce: input.handshake.nonce,
  });

  if (!verified.ok) return { ok: false, reason: verified.reason };

  // `sub` is the Telegram user id, which is the only identity this app recognises.
  const telegramUserId = Number(verified.claims.sub);
  if (!Number.isInteger(telegramUserId) || telegramUserId <= 0) {
    return { ok: false, reason: "no-telegram-id" };
  }

  return {
    ok: true,
    telegramUserId,
    claims: verified.claims,
    returnTo: safeReturnTo(input.handshake.returnTo),
  };
}

/** The name to enrol somebody under, from whatever claims Telegram supplied. */
export function nameFromClaims(claims: IdTokenClaims): {
  firstName: string;
  lastName?: string;
  username?: string;
} {
  const firstName =
    claims.given_name?.trim() || claims.name?.trim().split(/\s+/)[0] || "Player";

  return {
    firstName,
    lastName: claims.family_name?.trim() || undefined,
    username: claims.preferred_username?.trim() || undefined,
  };
}

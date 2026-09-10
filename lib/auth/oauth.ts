import { createHash, randomBytes } from "node:crypto";

/**
 * Telegram's OAuth login, for people at a desktop browser rather than in the app.
 *
 * Authorization code with PKCE, per https://core.telegram.org/widgets/login as read
 * on 10 Sep 2026. The older hash-based widget — the one that posted `id`, `auth_date`
 * and a `hash` verified against `SHA256(bot_token)` — is archived, so it is not
 * implemented here: building against an archived spec is how you ship something that
 * works right up until it does not.
 */

export const TELEGRAM_AUTH_URL = "https://oauth.telegram.org/auth";
export const TELEGRAM_TOKEN_URL = "https://oauth.telegram.org/token";

/** `openid` is what makes an ID token come back at all. */
export const DEFAULT_SCOPES = ["openid", "profile"] as const;

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/**
 * S256, never `plain`. A `plain` challenge is the verifier, so anybody who can see
 * the authorization request can complete the exchange — which is the exact attack
 * PKCE exists to stop.
 */
export function createPkcePair(bytes = 32): PkcePair {
  const verifier = randomBytes(bytes).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  nonce?: string;
  scopes?: readonly string[];
}

export function authorizeUrl(params: AuthorizeParams, base = TELEGRAM_AUTH_URL): string {
  const url = new URL(base);

  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (params.scopes ?? DEFAULT_SCOPES).join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.nonce) url.searchParams.set("nonce", params.nonce);

  return url.toString();
}

export interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
}

export interface ExchangeParams {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
}

/** The exchange is server-side only: the client secret must never reach a browser. */
export async function exchangeCode(
  params: ExchangeParams,
  options: { tokenUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<TokenResponse> {
  const get = options.fetchImpl ?? fetch;
  const credentials = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString(
    "base64",
  );

  const response = await get(options.tokenUrl ?? TELEGRAM_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
      code_verifier: params.verifier,
    }).toString(),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Token exchange failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return (await response.json()) as TokenResponse;
}

/**
 * The bot id is the OAuth client id, and it is the part of the bot token before the
 * colon. Deriving it saves configuring the same number twice and getting it wrong
 * once.
 */
export function botIdFromToken(botToken: string): string | null {
  const [id] = botToken.split(":");
  return id && /^\d+$/.test(id) ? id : null;
}

/**
 * The short-lived state carried across the redirect. It lives in a cookie rather than
 * in memory because the callback can land on a different serverless instance from the
 * one that started the flow.
 */
export interface LoginHandshake {
  state: string;
  verifier: string;
  nonce: string;
  /** Where to send them once they are back. */
  returnTo: string;
}

export function encodeHandshake(handshake: LoginHandshake): string {
  return Buffer.from(JSON.stringify(handshake)).toString("base64url");
}

export function decodeHandshake(value: string | undefined): LoginHandshake | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed?.state !== "string" ||
      typeof parsed.verifier !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.returnTo !== "string"
    ) {
      return null;
    }
    return parsed as LoginHandshake;
  } catch {
    return null;
  }
}

/**
 * Only ever a path on this site. Without this an attacker could hand somebody a login
 * link that logs them in and then bounces them somewhere else entirely — a working
 * login is exactly what makes the redirect convincing.
 */
export function safeReturnTo(value: string | null | undefined, fallback = "/app"): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  // "//evil.example" is protocol-relative and leaves the site.
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}

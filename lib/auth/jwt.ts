import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";

/**
 * Verifying the ID token from Telegram's OAuth login.
 *
 * Web login is no longer the old `SHA256(bot_token)` hash check — that page is
 * archived. The current flow is OpenID Connect: the browser gets an authorization
 * code, the server exchanges it, and what comes back is an RS256-signed JWT that has
 * to be checked against Telegram's published keys.
 *
 * Written on `node:crypto` rather than pulling in a JWT library, because the whole
 * job is three lines of signature verification plus some claim checks, and every
 * dependency in an auth path is a dependency you have to keep trusting.
 */

export const TELEGRAM_ISSUER = "https://oauth.telegram.org";
export const TELEGRAM_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";

export interface Jwk extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

export interface IdTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat?: number;
  nonce?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
  phone_number?: string;
}

export type JwtFailure =
  | "malformed"
  | "unsupported-algorithm"
  | "unknown-key"
  | "bad-signature"
  | "wrong-issuer"
  | "wrong-audience"
  | "expired"
  | "wrong-nonce";

export type JwtResult =
  | { ok: true; claims: IdTokenClaims }
  | { ok: false; reason: JwtFailure };

/**
 * Only RS256. Telegram can be configured to sign with EdDSA or ES256K, but those are
 * for Web3 integrations on the `openid` scope alone, and quietly accepting an
 * algorithm we did not ask for is how "alg: none" bugs happen.
 */
const SUPPORTED_ALGORITHMS = new Set(["RS256"]);

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

export function verifyIdToken(
  token: string,
  options: {
    keys: Jwk[];
    audience: string;
    issuer?: string;
    now?: Date;
    nonce?: string;
    /** Seconds of clock skew to forgive on `exp`. */
    leewaySeconds?: number;
  },
): JwtResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let claims: IdTokenClaims;
  try {
    header = decodeSegment(headerSegment) as { alg?: string; kid?: string };
    claims = decodeSegment(payloadSegment) as IdTokenClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!header?.alg || !SUPPORTED_ALGORITHMS.has(header.alg)) {
    return { ok: false, reason: "unsupported-algorithm" };
  }

  const key = selectKey(options.keys, header.kid);
  if (!key) return { ok: false, reason: "unknown-key" };

  let verified = false;
  try {
    const publicKey = createPublicKey({ key: key as JsonWebKey, format: "jwk" });
    verified = createVerify("RSA-SHA256")
      .update(`${headerSegment}.${payloadSegment}`)
      .verify(publicKey, Buffer.from(signatureSegment, "base64url"));
  } catch {
    return { ok: false, reason: "bad-signature" };
  }

  if (!verified) return { ok: false, reason: "bad-signature" };

  // Claims are only trusted once the signature is, so nothing below can be used to
  // probe what we accept.
  if (claims.iss !== (options.issuer ?? TELEGRAM_ISSUER)) {
    return { ok: false, reason: "wrong-issuer" };
  }

  if (!audienceMatches(claims.aud, options.audience)) {
    return { ok: false, reason: "wrong-audience" };
  }

  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const leeway = options.leewaySeconds ?? 60;
  if (typeof claims.exp !== "number" || claims.exp + leeway < now) {
    return { ok: false, reason: "expired" };
  }

  if (options.nonce !== undefined && claims.nonce !== options.nonce) {
    return { ok: false, reason: "wrong-nonce" };
  }

  return { ok: true, claims };
}

/**
 * A `kid` picks the key; with no `kid` we will try a lone key, but never guess among
 * several — silently picking one of many is a signature check that does not check.
 */
function selectKey(keys: Jwk[], kid?: string): Jwk | undefined {
  const usable = keys.filter((k) => k.kty === "RSA" && (k.alg ?? "RS256") === "RS256");
  if (kid) return usable.find((k) => k.kid === kid);
  return usable.length === 1 ? usable[0] : undefined;
}

function audienceMatches(aud: string | string[] | undefined, expected: string): boolean {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.includes(expected);
  return false;
}

/** Where the keys come from, so tests can hand over a local pair. */
export interface JwksSource {
  keys(): Promise<Jwk[]>;
}

/**
 * Telegram's keys, cached. Fetching them on every login would put an outbound request
 * from Telegram's infrastructure in the critical path of our own login.
 */
export function httpJwks(
  url = TELEGRAM_JWKS_URL,
  options: { ttlMs?: number; fetchImpl?: typeof fetch } = {},
): JwksSource {
  const ttl = options.ttlMs ?? 60 * 60 * 1000;
  const get = options.fetchImpl ?? fetch;

  let cached: { keys: Jwk[]; at: number } | null = null;

  return {
    async keys() {
      if (cached && Date.now() - cached.at < ttl) return cached.keys;

      const response = await get(url);
      if (!response.ok) {
        // A stale key set beats no key set: keys rotate rarely, outages do not.
        if (cached) return cached.keys;
        throw new Error(`Could not fetch JWKS from ${url}: ${response.status}`);
      }

      const body = (await response.json()) as { keys?: Jwk[] };
      const keys = body.keys ?? [];
      cached = { keys, at: Date.now() };
      return keys;
    },
  };
}

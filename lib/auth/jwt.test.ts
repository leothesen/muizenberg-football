import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { httpJwks, TELEGRAM_ISSUER, verifyIdToken, type Jwk } from "./jwt";

/**
 * A local RSA pair stands in for Telegram's signing key, so the whole verification
 * path is exercised for real — no live credentials, no network, no mocked crypto.
 */
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherPair = generateKeyPairSync("rsa", { modulusLength: 2048 });

const AUDIENCE = "123456";
const NOW = new Date("2026-09-10T09:00:00Z");

function jwkOf(publicKey: KeyObject, kid: string): Jwk {
  return { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
}

const KEYS = [jwkOf(pair.publicKey, "telegram-1")];

function sign(
  claims: Record<string, unknown>,
  options: { kid?: string; alg?: string; privateKey?: KeyObject } = {},
): string {
  const header = { alg: options.alg ?? "RS256", typ: "JWT", kid: options.kid ?? "telegram-1" };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const body = `${encode(header)}.${encode(claims)}`;
  const signature = createSign("RSA-SHA256")
    .update(body)
    .sign(options.privateKey ?? pair.privateKey)
    .toString("base64url");

  return `${body}.${signature}`;
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: TELEGRAM_ISSUER,
    aud: AUDIENCE,
    sub: "100001",
    exp: Math.floor(NOW.getTime() / 1000) + 3600,
    iat: Math.floor(NOW.getTime() / 1000),
    name: "Leo",
    preferred_username: "leo",
    ...overrides,
  };
}

describe("verifyIdToken", () => {
  it("accepts a properly signed token", () => {
    const result = verifyIdToken(sign(validClaims()), {
      keys: KEYS,
      audience: AUDIENCE,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("100001");
      expect(result.claims.preferred_username).toBe("leo");
    }
  });

  it("rejects a token signed by somebody else's key", () => {
    const token = sign(validClaims(), { privateKey: otherPair.privateKey });
    expect(verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rejects a tampered payload", () => {
    const token = sign(validClaims());
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify(validClaims({ sub: "999" }))).toString(
      "base64url",
    );

    expect(
      verifyIdToken(`${header}.${forged}.${signature}`, {
        keys: KEYS,
        audience: AUDIENCE,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("refuses alg: none rather than trusting an unsigned token", () => {
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const token = `${encode({ alg: "none", typ: "JWT" })}.${encode(validClaims())}.`;

    expect(verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "unsupported-algorithm",
    });
  });

  it("refuses an algorithm we did not ask for", () => {
    const token = sign(validClaims(), { alg: "HS256" });
    expect(verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "unsupported-algorithm",
    });
  });

  it("rejects a token whose kid is not in the key set", () => {
    const token = sign(validClaims(), { kid: "rotated-away" });
    expect(verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "unknown-key",
    });
  });

  it("will not guess between several keys when the token names none", () => {
    const token = sign(validClaims(), { kid: undefined });
    const stripped = (() => {
      const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
      const header = encode({ alg: "RS256", typ: "JWT" });
      const [, payload, signature] = token.split(".");
      return `${header}.${payload}.${signature}`;
    })();

    const many = [...KEYS, jwkOf(otherPair.publicKey, "telegram-2")];
    expect(verifyIdToken(stripped, { keys: many, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "unknown-key",
    });
  });

  it("rejects the wrong issuer", () => {
    const token = sign(validClaims({ iss: "https://oauth.example.com" }));
    expect(verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "wrong-issuer",
    });
  });

  it("rejects a token minted for a different bot", () => {
    const token = sign(validClaims({ aud: "999999" }));
    expect(verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "wrong-audience",
    });
  });

  it("accepts an audience array that contains us", () => {
    const token = sign(validClaims({ aud: ["999999", AUDIENCE] }));
    expect(verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW }).ok).toBe(true);
  });

  it("rejects an expired token", () => {
    const token = sign(validClaims({ exp: Math.floor(NOW.getTime() / 1000) - 3600 }));
    expect(verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("forgives a little clock skew on expiry", () => {
    const token = sign(validClaims({ exp: Math.floor(NOW.getTime() / 1000) - 30 }));
    expect(verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW }).ok).toBe(true);
  });

  it("rejects a token with no expiry at all", () => {
    const claims = validClaims();
    delete (claims as { exp?: number }).exp;
    expect(verifyIdToken(sign(claims), { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("checks the nonce when one was sent", () => {
    const token = sign(validClaims({ nonce: "abc" }));
    expect(
      verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW, nonce: "abc" }).ok,
    ).toBe(true);
    expect(
      verifyIdToken(token, { keys: KEYS, audience: AUDIENCE, now: NOW, nonce: "xyz" }),
    ).toEqual({ ok: false, reason: "wrong-nonce" });
  });

  it("rejects anything that is not three segments", () => {
    expect(verifyIdToken("nope", { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects segments that are not JSON", () => {
    expect(verifyIdToken("aaa.bbb.ccc", { keys: KEYS, audience: AUDIENCE, now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("httpJwks", () => {
  it("fetches once and caches", async () => {
    let calls = 0;
    const source = httpJwks("https://example.test/jwks", {
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ keys: KEYS }), { status: 200 });
      },
    });

    expect(await source.keys()).toHaveLength(1);
    expect(await source.keys()).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it("keeps serving the cached keys when a refresh fails", async () => {
    let calls = 0;
    const source = httpJwks("https://example.test/jwks", {
      ttlMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response(JSON.stringify({ keys: KEYS }), { status: 200 })
          : new Response("nope", { status: 500 });
      },
    });

    expect(await source.keys()).toHaveLength(1);
    // Keys rotate rarely; outages do not. Stale beats nothing.
    expect(await source.keys()).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("throws when it has never had keys and cannot get any", async () => {
    const source = httpJwks("https://example.test/jwks", {
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });

    await expect(source.keys()).rejects.toThrow("Could not fetch JWKS");
  });
});

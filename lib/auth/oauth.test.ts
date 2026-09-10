import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  botIdFromToken,
  createPkcePair,
  decodeHandshake,
  encodeHandshake,
  exchangeCode,
  safeReturnTo,
  TELEGRAM_AUTH_URL,
} from "./oauth";

describe("createPkcePair", () => {
  it("produces an S256 challenge of its own verifier", () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("never reuses a verifier", () => {
    const seen = new Set(Array.from({ length: 50 }, () => createPkcePair().verifier));
    expect(seen.size).toBe(50);
  });

  it("is url safe on both halves", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never emits a plain challenge equal to the verifier", () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).not.toBe(verifier);
  });
});

describe("authorizeUrl", () => {
  const params = {
    clientId: "123456",
    redirectUri: "https://example.test/api/auth/login/callback",
    state: "state-value",
    challenge: "challenge-value",
    nonce: "nonce-value",
  };

  it("builds the documented authorization request", () => {
    const url = new URL(authorizeUrl(params));

    expect(`${url.origin}${url.pathname}`).toBe(TELEGRAM_AUTH_URL);
    expect(url.searchParams.get("client_id")).toBe("123456");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(params.redirectUri);
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("nonce")).toBe("nonce-value");
  });

  it("asks for openid, without which no ID token comes back", () => {
    const url = new URL(authorizeUrl(params));
    expect(url.searchParams.get("scope")?.split(" ")).toContain("openid");
  });

  it("leaves the nonce out when there is none", () => {
    const url = new URL(authorizeUrl({ ...params, nonce: undefined }));
    expect(url.searchParams.has("nonce")).toBe(false);
  });
});

describe("exchangeCode", () => {
  const params = {
    clientId: "123456",
    clientSecret: "shhh",
    code: "auth-code",
    redirectUri: "https://example.test/cb",
    verifier: "the-verifier",
  };

  it("posts the code with basic credentials and the verifier", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;

    const result = await exchangeCode(params, {
      tokenUrl: "https://example.test/token",
      fetchImpl: async (url, init) => {
        seen = { url: String(url), init };
        return new Response(JSON.stringify({ id_token: "jwt", token_type: "Bearer" }), {
          status: 200,
        });
      },
    });

    expect(result.id_token).toBe("jwt");
    const captured = seen as { url: string; init?: RequestInit } | null;
    expect(captured?.url).toBe("https://example.test/token");

    const headers = captured?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(
      `Basic ${Buffer.from("123456:shhh").toString("base64")}`,
    );

    const body = new URLSearchParams(String(captured?.init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("code")).toBe("auth-code");
  });

  it("throws with the status when the exchange is refused", async () => {
    await expect(
      exchangeCode(params, {
        tokenUrl: "https://example.test/token",
        fetchImpl: async () => new Response("invalid_grant", { status: 400 }),
      }),
    ).rejects.toThrow("Token exchange failed (400)");
  });
});

describe("botIdFromToken", () => {
  it("takes the number before the colon", () => {
    expect(botIdFromToken("123456:AAH-secret")).toBe("123456");
  });

  it("returns null for anything that is not a bot token", () => {
    expect(botIdFromToken("no-colon")).toBeNull();
    expect(botIdFromToken("abc:def")).toBeNull();
    expect(botIdFromToken("")).toBeNull();
  });
});

describe("handshake", () => {
  const handshake = {
    state: "s",
    verifier: "v",
    nonce: "n",
    returnTo: "/app",
  };

  it("round trips", () => {
    expect(decodeHandshake(encodeHandshake(handshake))).toEqual(handshake);
  });

  it("rejects rubbish rather than throwing", () => {
    expect(decodeHandshake("not-base64url!!")).toBeNull();
    expect(decodeHandshake(undefined)).toBeNull();
  });

  it("rejects a handshake missing a field", () => {
    const partial = Buffer.from(JSON.stringify({ state: "s" })).toString("base64url");
    expect(decodeHandshake(partial)).toBeNull();
  });
});

describe("safeReturnTo", () => {
  it("keeps a path on this site", () => {
    expect(safeReturnTo("/table")).toBe("/table");
  });

  it("refuses an absolute url", () => {
    expect(safeReturnTo("https://evil.example/steal")).toBe("/app");
  });

  it("refuses a protocol-relative url, which leaves the site while looking local", () => {
    expect(safeReturnTo("//evil.example")).toBe("/app");
  });

  it("refuses a backslash, which some browsers normalise to a slash", () => {
    expect(safeReturnTo("/\\evil.example")).toBe("/app");
  });

  it("falls back when there is nothing", () => {
    expect(safeReturnTo(null)).toBe("/app");
    expect(safeReturnTo(undefined, "/somewhere")).toBe("/somewhere");
  });
});

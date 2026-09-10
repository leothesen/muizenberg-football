import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decodeSession,
  encodeSession,
  newSession,
  randomToken,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from "./session";

const SECRET = "a-long-random-session-secret-value";
const NOW = new Date("2026-09-10T09:00:00Z");

describe("session round trip", () => {
  it("survives encoding and decoding", () => {
    const session = newSession({ playerId: "p1", telegramUserId: 100001, now: NOW });
    const result = decodeSession(encodeSession(session, SECRET), SECRET, { now: NOW });

    expect(result).toEqual({ ok: true, session });
  });

  it("rejects a cookie signed with a different secret", () => {
    const token = encodeSession(newSession({ playerId: "p1", telegramUserId: 1, now: NOW }), SECRET);
    expect(decodeSession(token, "some-other-secret", { now: NOW })).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rejects a payload edited to claim somebody else", () => {
    const token = encodeSession(newSession({ playerId: "p1", telegramUserId: 1, now: NOW }), SECRET);
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ playerId: "admin", telegramUserId: 2, issuedAt: 1 }),
    ).toString("base64url");

    expect(decodeSession(`${forged}.${signature}`, SECRET, { now: NOW })).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rejects an expired session", () => {
    const old = new Date(NOW.getTime() - (SESSION_MAX_AGE_SECONDS + 60) * 1000);
    const token = encodeSession(
      newSession({ playerId: "p1", telegramUserId: 1, now: old }),
      SECRET,
    );

    expect(decodeSession(token, SECRET, { now: NOW })).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects rubbish without throwing", () => {
    expect(decodeSession("nonsense", SECRET, { now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(decodeSession(undefined, SECRET, { now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(decodeSession("a.b.c", SECRET, { now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a correctly signed payload that is not a session", () => {
    // A valid signature is not the same as valid contents, and the shape check has to
    // happen after the signature rather than instead of it.
    const payload = Buffer.from(JSON.stringify({ hello: "world" })).toString("base64url");
    const resigned = createHmac("sha256", SECRET).update(payload).digest("base64url");

    expect(decodeSession(`${payload}.${resigned}`, SECRET, { now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("refuses to decode without a secret", () => {
    const token = encodeSession(newSession({ playerId: "p1", telegramUserId: 1, now: NOW }), SECRET);
    expect(decodeSession(token, "", { now: NOW })).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("sessionCookieOptions", () => {
  it("uses SameSite=None with Secure in production, because a Mini App is embedded", () => {
    expect(sessionCookieOptions({ secure: true })).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
  });

  it("never sends SameSite=None without Secure, which browsers ignore anyway", () => {
    const local = sessionCookieOptions({ secure: false });
    expect(local.sameSite).toBe("lax");
    expect(local.secure).toBe(false);
  });
});

describe("randomToken", () => {
  it("is unguessable enough and url safe", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

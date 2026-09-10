import { describe, expect, it } from "vitest";
import {
  buildDataCheckString,
  DEFAULT_INIT_DATA_MAX_AGE_SECONDS,
  hashesMatch,
  signInitData,
  verifyInitData,
} from "./mini-app";

const BOT_TOKEN = "123456:AAH-not-a-real-token";
const NOW = new Date("2026-09-10T09:00:00Z");

const USER = {
  id: 100001,
  first_name: "Leo",
  username: "leo",
};

/** Builds initData the way Telegram would, so the test signs with the real algorithm. */
function initData(
  fields: Record<string, string> = {},
  options: { token?: string; authDate?: Date; omitHash?: boolean; badHash?: boolean } = {},
): string {
  const params = new URLSearchParams({
    user: JSON.stringify(USER),
    auth_date: String(
      Math.floor((options.authDate ?? NOW).getTime() / 1000),
    ),
    chat_instance: "-9999999999999999999",
    chat_type: "supergroup",
    ...fields,
  });

  if (!options.omitHash) {
    const hash = options.badHash
      ? "0".repeat(64)
      : signInitData(params, options.token ?? BOT_TOKEN);
    params.set("hash", hash);
  }

  return params.toString();
}

describe("buildDataCheckString", () => {
  it("sorts fields alphabetically and joins with newlines", () => {
    const params = new URLSearchParams({ b: "2", a: "1", c: "3" });
    expect(buildDataCheckString(params)).toBe("a=1\nb=2\nc=3");
  });

  it("removes hash and nothing else", () => {
    const params = new URLSearchParams({ auth_date: "1", hash: "deadbeef", user: "{}" });
    expect(buildDataCheckString(params)).toBe("auth_date=1\nuser={}");
  });

  it("keeps the signature field in the string", () => {
    // The Ed25519 third-party flow strips `signature`; the bot-token flow does not.
    // Getting this backwards fails against real Telegram and passes every test that
    // was built from the same wrong assumption, so it is pinned here explicitly.
    const params = new URLSearchParams({
      auth_date: "1",
      signature: "abc",
      hash: "deadbeef",
    });
    expect(buildDataCheckString(params)).toBe("auth_date=1\nsignature=abc");
  });

  it("uses decoded values, not the percent-encoded ones", () => {
    const params = new URLSearchParams("user=%7B%22id%22%3A1%7D");
    expect(buildDataCheckString(params)).toBe('user={"id":1}');
  });
});

describe("verifyInitData", () => {
  it("accepts data signed with the right bot token", () => {
    const result = verifyInitData(initData(), BOT_TOKEN, { now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(100001);
      expect(result.user.first_name).toBe("Leo");
      expect(result.authDate).toEqual(NOW);
    }
  });

  it("rejects data signed with a different bot token", () => {
    const forged = initData({}, { token: "999999:someone-elses-bot" });
    const result = verifyInitData(forged, BOT_TOKEN, { now: NOW });

    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a tampered field even when the hash is carried over", () => {
    const params = new URLSearchParams(initData());
    params.set("user", JSON.stringify({ ...USER, id: 999999 }));

    expect(verifyInitData(params.toString(), BOT_TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rejects an added field", () => {
    const params = new URLSearchParams(initData());
    params.set("is_admin", "true");

    expect(verifyInitData(params.toString(), BOT_TOKEN, { now: NOW }).ok).toBe(false);
  });

  it("rejects data with no hash at all", () => {
    expect(verifyInitData(initData({}, { omitHash: true }), BOT_TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: "no-hash",
    });
  });

  it("rejects a hash of the wrong shape without throwing", () => {
    const params = new URLSearchParams(initData());
    params.set("hash", "not-hex");
    expect(verifyInitData(params.toString(), BOT_TOKEN, { now: NOW }).ok).toBe(false);
  });

  it("rejects empty input", () => {
    expect(verifyInitData("", BOT_TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifyInitData(initData(), "", { now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects stale data", () => {
    const old = new Date(NOW.getTime() - (DEFAULT_INIT_DATA_MAX_AGE_SECONDS + 60) * 1000);
    expect(verifyInitData(initData({}, { authDate: old }), BOT_TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("accepts data right up to the age limit", () => {
    const edge = new Date(NOW.getTime() - (DEFAULT_INIT_DATA_MAX_AGE_SECONDS - 5) * 1000);
    expect(verifyInitData(initData({}, { authDate: edge }), BOT_TOKEN, { now: NOW }).ok).toBe(
      true,
    );
  });

  it("tolerates a little clock skew but not a wildly future date", () => {
    const slightlyAhead = new Date(NOW.getTime() + 30_000);
    expect(
      verifyInitData(initData({}, { authDate: slightlyAhead }), BOT_TOKEN, { now: NOW }).ok,
    ).toBe(true);

    const wayAhead = new Date(NOW.getTime() + 86_400_000);
    expect(verifyInitData(initData({}, { authDate: wayAhead }), BOT_TOKEN, { now: NOW })).toEqual(
      { ok: false, reason: "expired" },
    );
  });

  it("checks the signature before it checks freshness", () => {
    // Otherwise an unsigned payload could learn whether a timestamp was plausible.
    const stale = new Date(NOW.getTime() - 999_999_000);
    const forged = initData({}, { authDate: stale, badHash: true });
    expect(verifyInitData(forged, BOT_TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rejects signed data with no user in it", () => {
    const params = new URLSearchParams({
      auth_date: String(Math.floor(NOW.getTime() / 1000)),
    });
    params.set("hash", signInitData(params, BOT_TOKEN));

    expect(verifyInitData(params.toString(), BOT_TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: "no-user",
    });
  });

  it("rejects signed data whose user is not parseable", () => {
    const params = new URLSearchParams({
      auth_date: String(Math.floor(NOW.getTime() / 1000)),
      user: "{not json",
    });
    params.set("hash", signInitData(params, BOT_TOKEN));

    expect(verifyInitData(params.toString(), BOT_TOKEN, { now: NOW })).toEqual({
      ok: false,
      reason: "no-user",
    });
  });

  it("carries a deep-link start parameter through", () => {
    const result = verifyInitData(initData({ start_param: "card" }), BOT_TOKEN, { now: NOW });
    expect(result.ok && result.startParam).toBe("card");
  });

  it("verifies data that carries the newer signature field", () => {
    const result = verifyInitData(initData({ signature: "Zm9vYmFy" }), BOT_TOKEN, { now: NOW });
    expect(result.ok).toBe(true);
  });
});

describe("hashesMatch", () => {
  it("matches identical hashes and rejects different ones", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    expect(hashesMatch(a, a)).toBe(true);
    expect(hashesMatch(a, b)).toBe(false);
  });

  it("rejects a mismatched length without throwing", () => {
    expect(hashesMatch("abcd", "ab")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(hashesMatch("", "")).toBe(false);
  });
});

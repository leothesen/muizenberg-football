import { describe, expect, it, vi } from "vitest";
import { completeLogin, nameFromClaims, type CompleteLoginInput } from "./login-flow";
import { TELEGRAM_ISSUER, type IdTokenClaims } from "./jwt";

const HANDSHAKE = {
  state: "the-state",
  verifier: "the-verifier",
  nonce: "the-nonce",
  returnTo: "/app",
};

const CLAIMS: IdTokenClaims = {
  iss: TELEGRAM_ISSUER,
  aud: "123456",
  sub: "100001",
  exp: 9_999_999_999,
  given_name: "Leo",
  family_name: "Thesen",
  preferred_username: "leo",
};

function input(overrides: Partial<CompleteLoginInput> = {}): CompleteLoginInput {
  return {
    handshake: HANDSHAKE,
    returnedState: HANDSHAKE.state,
    code: "auth-code",
    providerError: null,
    exchange: async () => ({ id_token: "signed.jwt.here" }),
    verify: () => ({ ok: true, claims: CLAIMS }),
    ...overrides,
  };
}

describe("completeLogin", () => {
  it("logs in a user whose token verifies", async () => {
    const result = await completeLogin(input());

    expect(result).toEqual({
      ok: true,
      telegramUserId: 100001,
      claims: CLAIMS,
      returnTo: "/app",
    });
  });

  it("refuses when there is no handshake to match against", async () => {
    expect(await completeLogin(input({ handshake: null }))).toEqual({
      ok: false,
      reason: "no-handshake",
    });
  });

  it("refuses a mismatched state", async () => {
    expect(await completeLogin(input({ returnedState: "somebody-elses" }))).toEqual({
      ok: false,
      reason: "state-mismatch",
    });
  });

  it("refuses a missing state", async () => {
    expect(await completeLogin(input({ returnedState: null }))).toEqual({
      ok: false,
      reason: "state-mismatch",
    });
  });

  it("checks the state before spending the code", async () => {
    // Otherwise an attacker's code is already redeemed by the time we notice whose
    // login this was.
    const exchange = vi.fn(async () => ({ id_token: "x" }));
    await completeLogin(input({ returnedState: "wrong", exchange }));
    expect(exchange).not.toHaveBeenCalled();
  });

  it("passes the PKCE verifier to the exchange", async () => {
    const exchange = vi.fn(async () => ({ id_token: "signed.jwt.here" }));
    await completeLogin(input({ exchange }));
    expect(exchange).toHaveBeenCalledWith({ code: "auth-code", verifier: "the-verifier" });
  });

  it("passes the nonce to verification, so a replayed token is caught", async () => {
    const verify = vi.fn(() => ({ ok: true as const, claims: CLAIMS }));
    await completeLogin(input({ verify }));
    expect(verify).toHaveBeenCalledWith({ idToken: "signed.jwt.here", nonce: "the-nonce" });
  });

  it("surfaces an error the provider reported", async () => {
    expect(await completeLogin(input({ providerError: "access_denied" }))).toEqual({
      ok: false,
      reason: "provider-error",
    });
  });

  it("refuses when there is no code", async () => {
    expect(await completeLogin(input({ code: null }))).toEqual({
      ok: false,
      reason: "no-code",
    });
  });

  it("turns a thrown exchange into a refusal, not a crash", async () => {
    const exchange = async () => {
      throw new Error("invalid_grant");
    };
    expect(await completeLogin(input({ exchange }))).toEqual({
      ok: false,
      reason: "exchange-failed",
    });
  });

  it("refuses when the exchange returns no id token", async () => {
    expect(await completeLogin(input({ exchange: async () => ({}) }))).toEqual({
      ok: false,
      reason: "no-id-token",
    });
  });

  it("passes a verification failure through by name", async () => {
    const verify = () => ({ ok: false as const, reason: "bad-signature" as const });
    expect(await completeLogin(input({ verify }))).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("refuses a token whose subject is not a Telegram id", async () => {
    const verify = () => ({ ok: true as const, claims: { ...CLAIMS, sub: "not-a-number" } });
    expect(await completeLogin(input({ verify }))).toEqual({
      ok: false,
      reason: "no-telegram-id",
    });
  });

  it("refuses a nonsensical subject rather than enrolling player zero", async () => {
    const verify = () => ({ ok: true as const, claims: { ...CLAIMS, sub: "0" } });
    expect(await completeLogin(input({ verify }))).toEqual({
      ok: false,
      reason: "no-telegram-id",
    });
  });

  it("will not bounce somebody off the site after logging them in", async () => {
    const result = await completeLogin(
      input({ handshake: { ...HANDSHAKE, returnTo: "https://evil.example/steal" } }),
    );
    expect(result.ok && result.returnTo).toBe("/app");
  });
});

describe("nameFromClaims", () => {
  it("prefers the given name", () => {
    expect(nameFromClaims(CLAIMS)).toEqual({
      firstName: "Leo",
      lastName: "Thesen",
      username: "leo",
    });
  });

  it("falls back to the first word of the full name", () => {
    expect(
      nameFromClaims({ ...CLAIMS, given_name: undefined, name: "Big Dave Smith" }).firstName,
    ).toBe("Big");
  });

  it("has a last resort rather than enrolling somebody as undefined", () => {
    expect(
      nameFromClaims({ ...CLAIMS, given_name: undefined, name: undefined }).firstName,
    ).toBe("Player");
  });

  it("drops blank claims rather than storing empty strings", () => {
    const name = nameFromClaims({
      ...CLAIMS,
      family_name: "   ",
      preferred_username: "",
    });
    expect(name.lastName).toBeUndefined();
    expect(name.username).toBeUndefined();
  });
});

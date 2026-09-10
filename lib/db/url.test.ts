import { describe, expect, it } from "vitest";
import { chooseDriver, isPooled, resolveDatabaseUrl } from "./url";

/**
 * Pure, so no database is needed. These are the decisions that are impossible to
 * check in production without breaking production.
 */

const NEON_POOLED =
  "postgresql://owner:pw@ep-cool-band-12345-pooler.eu-central-1.aws.neon.tech/muizenberg?sslmode=require";
const NEON_DIRECT =
  "postgresql://owner:pw@ep-cool-band-12345.eu-central-1.aws.neon.tech/muizenberg?sslmode=require";
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54332/muizenberg";

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL", () => {
    expect(
      resolveDatabaseUrl({ DATABASE_URL: LOCAL, POSTGRES_URL: NEON_DIRECT }),
    ).toBe(LOCAL);
  });

  it("falls back through the names Vercel's Neon integration sets", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: NEON_POOLED })).toBe(NEON_POOLED);
    expect(resolveDatabaseUrl({ DATABASE_URL_UNPOOLED: NEON_DIRECT })).toBe(
      NEON_DIRECT,
    );
    expect(resolveDatabaseUrl({ POSTGRES_URL_NON_POOLING: NEON_DIRECT })).toBe(
      NEON_DIRECT,
    );
  });

  it("prefers a pooled name over an unpooled one", () => {
    // A serverless function opening a direct connection per invocation runs out of
    // them. If both are present the pooler is the right answer.
    expect(
      resolveDatabaseUrl({
        POSTGRES_URL: NEON_POOLED,
        POSTGRES_URL_NON_POOLING: NEON_DIRECT,
      }),
    ).toBe(NEON_POOLED);
  });

  it("ignores a variable that is present but empty", () => {
    // Vercel writes an empty string for a variable defined with no value, which is
    // not the same as unset and would otherwise win.
    expect(
      resolveDatabaseUrl({ DATABASE_URL: "  ", POSTGRES_URL: NEON_POOLED }),
    ).toBe(NEON_POOLED);
  });

  it("names every variable it looked at when there is nothing to use", () => {
    expect(() => resolveDatabaseUrl({})).toThrow(/DATABASE_URL/);
    expect(() => resolveDatabaseUrl({})).toThrow(/POSTGRES_URL_NON_POOLING/);
  });
});

describe("chooseDriver", () => {
  it("uses the Neon driver for a Neon host", () => {
    expect(chooseDriver(NEON_POOLED, {})).toBe("neon");
    expect(chooseDriver(NEON_DIRECT, {})).toBe("neon");
  });

  it("uses plain Postgres for anything else", () => {
    expect(chooseDriver(LOCAL, {})).toBe("pg");
  });

  it("decides from the host, not from NODE_ENV", () => {
    // So that pointing a local process at a Neon branch works, and running a
    // production build against Docker does too.
    expect(chooseDriver(LOCAL, { NODE_ENV: "production" })).toBe("pg");
    expect(chooseDriver(NEON_POOLED, { NODE_ENV: "development" })).toBe("neon");
  });

  it("can be overridden explicitly", () => {
    expect(chooseDriver(LOCAL, { DATABASE_DRIVER: "neon" })).toBe("neon");
    expect(chooseDriver(NEON_POOLED, { DATABASE_DRIVER: "pg" })).toBe("pg");
  });

  it("ignores an override that is not a driver", () => {
    expect(chooseDriver(LOCAL, { DATABASE_DRIVER: "http" })).toBe("pg");
  });
});

describe("isPooled", () => {
  it("recognises Neon's pooled endpoint", () => {
    expect(isPooled(NEON_POOLED)).toBe(true);
    expect(isPooled(NEON_DIRECT)).toBe(false);
  });
});

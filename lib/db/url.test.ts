import { describe, expect, it } from "vitest";
import {
  chooseDriver,
  describeConnection,
  isPooled,
  resolveDatabaseUrl,
  resolveMigrationUrl,
} from "./url";

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

describe("resolveMigrationUrl", () => {
  it("prefers the direct endpoint over the pooled one", () => {
    // The opposite of what the app wants, and the reason this function exists.
    // Neon's pooler is PgBouncer in transaction mode; DDL and `create role` belong
    // on a real session.
    expect(
      resolveMigrationUrl({
        DATABASE_URL: NEON_POOLED,
        DATABASE_URL_UNPOOLED: NEON_DIRECT,
      }),
    ).toBe(NEON_DIRECT);
  });

  it("disagrees with the app on purpose, given one Neon environment", () => {
    // The whole Vercel Neon integration in one object. Both readers are handed the
    // same thing and must come to different conclusions; if this ever collapses to
    // one answer, one of the two callers has quietly become wrong.
    const neonIntegration = {
      DATABASE_URL: NEON_POOLED,
      DATABASE_URL_UNPOOLED: NEON_DIRECT,
      POSTGRES_URL: NEON_POOLED,
      POSTGRES_URL_NON_POOLING: NEON_DIRECT,
    };

    expect(resolveDatabaseUrl(neonIntegration)).toBe(NEON_POOLED);
    expect(resolveMigrationUrl(neonIntegration)).toBe(NEON_DIRECT);
  });

  it("honours an explicit MIGRATION_DATABASE_URL above everything", () => {
    expect(
      resolveMigrationUrl({
        MIGRATION_DATABASE_URL: LOCAL,
        DATABASE_URL_UNPOOLED: NEON_DIRECT,
      }),
    ).toBe(LOCAL);
  });

  it("falls back to DATABASE_URL so local Docker needs no extra setup", () => {
    // Docker sets one variable and has no pooler to avoid.
    expect(resolveMigrationUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it("ignores a variable that is present but empty", () => {
    expect(
      resolveMigrationUrl({ DATABASE_URL_UNPOOLED: "  ", DATABASE_URL: LOCAL }),
    ).toBe(LOCAL);
  });

  it("names every variable it looked at when there is nothing to use", () => {
    expect(() => resolveMigrationUrl({})).toThrow(/MIGRATION_DATABASE_URL/);
    expect(() => resolveMigrationUrl({})).toThrow(/DATABASE_URL_UNPOOLED/);
  });
});

describe("describeConnection", () => {
  it("keeps the host and database", () => {
    expect(describeConnection(NEON_DIRECT)).toBe(
      "ep-cool-band-12345.eu-central-1.aws.neon.tech/muizenberg",
    );
    expect(describeConnection(LOCAL)).toBe("127.0.0.1:54332/muizenberg");
  });

  it("never leaks the password", () => {
    // This string goes into a Vercel build log, which is not a private place.
    expect(describeConnection(NEON_POOLED)).not.toContain("pw");
    expect(describeConnection(NEON_POOLED)).not.toContain("owner");
  });

  it("says so rather than throwing when the string is not a URL", () => {
    // A broken connection string should fail at connect time with a real message,
    // not inside the line that was only trying to describe it.
    expect(describeConnection("host=localhost dbname=muizenberg")).toBe(
      "(unparseable connection string)",
    );
  });
});

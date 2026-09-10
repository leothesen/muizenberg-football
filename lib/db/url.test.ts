import { describe, expect, it } from "vitest";
import {
  checkMigrationTarget,
  chooseDriver,
  describeConnection,
  hostFingerprint,
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
  it("names the database and fingerprints the host", () => {
    expect(describeConnection(LOCAL)).toMatch(
      /^muizenberg @ host#[0-9a-f]{8} \(direct\)$/,
    );
    expect(describeConnection(NEON_POOLED)).toMatch(/\(pooled\)$/);
    expect(describeConnection(NEON_DIRECT)).toMatch(/\(direct\)$/);
  });

  it("does not print the host, because Vercel redacts it", () => {
    // The first version printed the host and came out of the build log as
    // "[REDACTED]/neondb" — the integration sets the host as its own variable, so the
    // scrubber replaced it. A fingerprint is not a substring of any secret.
    expect(describeConnection(NEON_DIRECT)).not.toContain("ep-cool-band-12345");
    expect(describeConnection(NEON_DIRECT)).not.toContain("neon.tech");
  });

  it("never leaks the password", () => {
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

describe("hostFingerprint", () => {
  it("is stable, and differs between hosts", () => {
    expect(hostFingerprint(NEON_DIRECT)).toBe(hostFingerprint(NEON_DIRECT));
    expect(hostFingerprint(NEON_DIRECT)).not.toBe(hostFingerprint(LOCAL));
  });

  it("tells the pooled and direct endpoints of one branch apart", () => {
    // They are different hosts, so they fingerprint differently. Worth pinning: it
    // means a production fingerprint has to be taken from the endpoint the migration
    // actually uses, not from whichever string was nearest to hand.
    expect(hostFingerprint(NEON_POOLED)).not.toBe(hostFingerprint(NEON_DIRECT));
  });

  it("is null for a string that will not parse", () => {
    expect(hostFingerprint("host=localhost")).toBeNull();
  });
});

describe("checkMigrationTarget", () => {
  const productionFingerprint = hostFingerprint(NEON_DIRECT) as string;

  it("says nothing at all outside a preview deployment", () => {
    expect(checkMigrationTarget(NEON_DIRECT, { VERCEL_ENV: "production" })).toEqual({
      ok: true,
      message: "",
    });
    expect(checkMigrationTarget(LOCAL, {})).toEqual({ ok: true, message: "" });
  });

  it("refuses when a preview has been handed production", () => {
    // Exactly what happened on the first pull request: preview branching was off, the
    // preview inherited production's DATABASE_URL, and the build migrated production
    // while reporting success.
    const result = checkMigrationTarget(NEON_DIRECT, {
      VERCEL_ENV: "preview",
      PRODUCTION_DB_FINGERPRINT: productionFingerprint,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Refusing to migrate/);
    expect(result.message).toMatch(/Previews Integration/);
  });

  it("allows a preview that got its own branch", () => {
    const result = checkMigrationTarget(LOCAL, {
      VERCEL_ENV: "preview",
      PRODUCTION_DB_FINGERPRINT: productionFingerprint,
    });

    expect(result).toEqual({ ok: true, message: "" });
  });

  it("warns rather than refuses when it cannot check", () => {
    // "I could not check" and "I checked and it was fine" are different, and the
    // build log should not make them look the same.
    const result = checkMigrationTarget(NEON_DIRECT, { VERCEL_ENV: "preview" });

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/PRODUCTION_DB_FINGERPRINT is not set/);
  });

  it("treats an empty fingerprint as unset", () => {
    const result = checkMigrationTarget(NEON_DIRECT, {
      VERCEL_ENV: "preview",
      PRODUCTION_DB_FINGERPRINT: "  ",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/not set/);
  });
});

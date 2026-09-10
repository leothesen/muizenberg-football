/**
 * Which database, over which driver.
 *
 * Pure and separate from the handles themselves so the decisions can be unit-tested
 * without a database, a network, or an environment.
 */

export type DriverKind = "neon" | "pg";

/**
 * Just enough of an environment to read variables out of.
 *
 * Deliberately not `NodeJS.ProcessEnv`, which Next augments with named keys and which
 * therefore refuses a plain object literal — these functions are pure and should be
 * callable with two made-up variables in a test.
 */
export type EnvLike = Record<string, string | undefined>;

/**
 * Where the connection string comes from.
 *
 * Vercel's Neon integration does not set one variable, it sets several — a pooled
 * one and a direct one, under two different naming conventions. The pooled endpoint
 * is wanted here: a serverless function that opens a direct connection per invocation
 * runs out of them, which is the failure PostgREST never had because it was HTTP all
 * along.
 *
 * Order is deliberate. Anything explicitly set as DATABASE_URL wins, then the pooled
 * names, then the unpooled ones as a last resort so a misconfigured project still
 * starts rather than failing at the first query.
 */
const URL_VARIABLES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

export function resolveDatabaseUrl(env: EnvLike = process.env): string {
  for (const name of URL_VARIABLES) {
    const value = env[name];
    if (value && value.trim() !== "") return value.trim();
  }

  throw new Error(
    `No database connection string. Set one of: ${URL_VARIABLES.join(", ")}.`,
  );
}

/** True for a connection string that is not pointing at a pooled endpoint. */
export function isPooled(url: string): boolean {
  return url.includes("-pooler.");
}

/**
 * Where the *migration* connection string comes from.
 *
 * The reverse of `URL_VARIABLES`, and deliberately so. The app wants the pooler
 * because it opens a connection per invocation; a migration is one long-lived session
 * doing DDL, which is the case the pooler is worst at. Neon's pooler is PgBouncer in
 * transaction mode, so session-scoped state and multi-statement DDL are exactly the
 * things it does not promise to keep together — and `0000` creates a role.
 *
 * `MIGRATION_DATABASE_URL` comes first as an escape hatch for the case where the
 * direct endpoint has to be named by hand. After that the unpooled names, and only
 * then the pooled ones, so a local Docker database — which sets `DATABASE_URL` and
 * nothing else, and has no pooler to avoid — still migrates with no extra setup.
 */
const MIGRATION_URL_VARIABLES = [
  "MIGRATION_DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "POSTGRES_URL",
] as const;

export function resolveMigrationUrl(env: EnvLike = process.env): string {
  for (const name of MIGRATION_URL_VARIABLES) {
    const value = env[name];
    if (value && value.trim() !== "") return value.trim();
  }

  throw new Error(
    `No database connection string to migrate. Set one of: ${MIGRATION_URL_VARIABLES.join(", ")}.`,
  );
}

/**
 * A short, stable, non-secret stand-in for a host.
 *
 * FNV-1a, deliberately not a real hash and deliberately not `node:crypto` — this is
 * only ever compared to another value produced the same way, and keeping this module
 * free of `node:` imports keeps it usable from anywhere without dragging the edge
 * build into a decision it does not need to make.
 */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The fingerprint of a connection string's host, or `null` if it will not parse. */
export function hostFingerprint(url: string): string | null {
  try {
    return fingerprint(new URL(url).host);
  } catch {
    return null;
  }
}

/**
 * A connection string reduced to something safe to print.
 *
 * The first version of this printed the host, which was the obvious thing and was
 * wrong: **Vercel redacts it.** The Neon integration sets the host as its own
 * environment variable, so Vercel's build log scrubber replaces it wherever it appears
 * and the line comes out as `[REDACTED]/neondb` — useless for the one question it was
 * added to answer, which is whether this deployment migrated its own Neon branch or
 * production's. Found the hard way, on the first pull request.
 *
 * A fingerprint is not a substring of any secret, so it survives the scrubber, and two
 * builds can still be compared: same fingerprint means same database.
 */
export function describeConnection(url: string): string {
  const parsed = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();

  if (!parsed) return "(unparseable connection string)";

  const database = parsed.pathname.replace(/^\//, "") || "(default)";
  return `${database} @ host#${fingerprint(parsed.host)} (${isPooled(url) ? "pooled" : "direct"})`;
}

/**
 * Refuse to migrate production from a preview build.
 *
 * The Neon integration only injects a per-deployment branch URL when preview branching
 * is switched on. When it is off there is no error and no empty variable — the preview
 * simply inherits the Preview environment's `DATABASE_URL`, which is usually
 * production's, and the build migrates production while reporting success. That is not
 * hypothetical: it is what happened on the first pull request in this repository.
 *
 * `PRODUCTION_DB_FINGERPRINT` is the answer. It is a hash rather than a host, so it is
 * not a secret and can be set on every environment; a preview that resolves to it has
 * been handed production and must stop. Unset, this can only warn — which is still
 * worth saying out loud, because "I cannot check this" is a different thing from
 * "I checked this and it was fine".
 */
export function checkMigrationTarget(
  url: string,
  env: EnvLike = process.env,
): { ok: boolean; message: string } {
  if (env.VERCEL_ENV !== "preview") {
    return { ok: true, message: "" };
  }

  const expected = env.PRODUCTION_DB_FINGERPRINT?.trim();
  if (!expected) {
    return {
      ok: true,
      message:
        "warning: PRODUCTION_DB_FINGERPRINT is not set, so this preview cannot check " +
        "that it is not about to migrate production. See docs/CICD.md.",
    };
  }

  if (hostFingerprint(url) === expected) {
    return {
      ok: false,
      message:
        "Refusing to migrate: this is a preview deployment, but the database it was " +
        "given is production. That means no per-preview Neon branch was injected, so " +
        "the deployment fell back to the Preview environment's DATABASE_URL. Install " +
        "the Neon Postgres Previews Integration on this Vercel project and redeploy. " +
        "See docs/CICD.md.",
    };
  }

  return { ok: true, message: "" };
}

/**
 * Which driver to use.
 *
 * Neon over WebSockets, everything else over plain TCP. Chosen from the host rather
 * than from NODE_ENV so that pointing a local process at a Neon branch does the right
 * thing, and running the production build against Docker does too.
 *
 * **Not `neon-http`**, though it is the obvious choice for serverless and was the
 * original plan. It has no transaction support at all — `db.transaction()`
 * typechecks and then throws "No transactions support in neon-http driver" at
 * runtime. Public reads need a transaction, because that is the only place
 * `set local role web_reader` can be scoped, so http would have failed in production
 * having passed every check here.
 */
export function chooseDriver(
  url: string,
  env: EnvLike = process.env,
): DriverKind {
  const override = env.DATABASE_DRIVER;
  if (override === "neon" || override === "pg") return override;

  return url.includes("neon.tech") ? "neon" : "pg";
}

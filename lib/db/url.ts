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

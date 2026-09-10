import { optionalEnv } from "./env";

/**
 * Cron authentication.
 *
 * Vercel calls scheduled routes with `Authorization: Bearer $CRON_SECRET`. These
 * endpoints post to the whole group, so an unauthenticated caller could spam the
 * chat — the check is not optional in production.
 */
export function cronRequestIsAuthorised(request: Request): boolean {
  const secret = optionalEnv("CRON_SECRET");

  // Without a configured secret, allow only outside production. That keeps local
  // development frictionless without ever leaving a deployed endpoint open.
  if (!secret) return process.env.NODE_ENV !== "production";

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookiesAreSecure } from "@/lib/auth/current-user";
import {
  authorizeUrl,
  botIdFromToken,
  createPkcePair,
  encodeHandshake,
  safeReturnTo,
} from "@/lib/auth/oauth";
import { randomToken } from "@/lib/auth/session";
import { optionalEnv, siteUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only has to outlive a trip to Telegram and back. */
export const HANDSHAKE_COOKIE = "mzb_login";
const HANDSHAKE_MAX_AGE_SECONDS = 600;

export function callbackUrl(): string {
  return new URL("/api/auth/login/callback", siteUrl()).toString();
}

/**
 * Starts the desktop login.
 *
 * The verifier, state and nonce go into a short-lived cookie rather than into memory,
 * because the callback can land on a different serverless instance from the one that
 * started the flow — and an in-memory map would work perfectly on a laptop and fail
 * intermittently in production, which is the worst way for it to fail.
 *
 * SameSite=Lax on that cookie is deliberate: the browser arrives back here as a
 * top-level GET redirect from Telegram, which Lax allows and Strict would not.
 */
export async function GET(request: Request): Promise<Response> {
  const clientId =
    optionalEnv("TELEGRAM_OAUTH_CLIENT_ID") ??
    botIdFromToken(optionalEnv("TELEGRAM_BOT_TOKEN") ?? "");

  if (!clientId || !optionalEnv("TELEGRAM_OAUTH_CLIENT_SECRET")) {
    return NextResponse.json(
      { ok: false, error: "web login is not configured" },
      { status: 503 },
    );
  }

  const { verifier, challenge } = createPkcePair();
  const state = randomToken();
  const nonce = randomToken();
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));

  const jar = await cookies();
  jar.set(HANDSHAKE_COOKIE, encodeHandshake({ state, verifier, nonce, returnTo }), {
    httpOnly: true,
    secure: cookiesAreSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: HANDSHAKE_MAX_AGE_SECONDS,
  });

  return NextResponse.redirect(
    authorizeUrl({ clientId, redirectUri: callbackUrl(), state, challenge, nonce }),
  );
}

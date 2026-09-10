import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookiesAreSecure, startSession } from "@/lib/auth/current-user";
import { httpJwks, verifyIdToken } from "@/lib/auth/jwt";
import { completeLogin, nameFromClaims } from "@/lib/auth/login-flow";
import { botIdFromToken, decodeHandshake, exchangeCode } from "@/lib/auth/oauth";
import { optionalEnv, requireEnv, siteUrl } from "@/lib/env";
import { ensurePlayer } from "@/lib/repo/players";
import { HANDSHAKE_COOKIE, callbackUrl } from "../start/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jwks = httpJwks();

/**
 * Where Telegram sends the browser back.
 *
 * All the ordering rules live in `completeLogin`, which is pure and tested; this is
 * the wiring around it. The one thing that has to happen here regardless of outcome
 * is clearing the handshake cookie: it is single use whether the login worked or not.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const jar = await cookies();

  const handshake = decodeHandshake(jar.get(HANDSHAKE_COOKIE)?.value);
  jar.set(HANDSHAKE_COOKIE, "", {
    httpOnly: true,
    secure: cookiesAreSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  const clientId =
    optionalEnv("TELEGRAM_OAUTH_CLIENT_ID") ??
    botIdFromToken(optionalEnv("TELEGRAM_BOT_TOKEN") ?? "");
  if (!clientId) return failed("web login is not configured");

  const outcome = await completeLogin({
    handshake,
    returnedState: url.searchParams.get("state"),
    code: url.searchParams.get("code"),
    providerError: url.searchParams.get("error"),
    exchange: ({ code, verifier }) =>
      exchangeCode({
        clientId,
        clientSecret: requireEnv("TELEGRAM_OAUTH_CLIENT_SECRET"),
        code,
        redirectUri: callbackUrl(),
        verifier,
      }),
    verify: async ({ idToken, nonce }) =>
      verifyIdToken(idToken, { keys: await jwks.keys(), audience: clientId, nonce }),
  });

  if (!outcome.ok) return failed(outcome.reason);

  const name = nameFromClaims(outcome.claims);
  const { player } = await ensurePlayer({
    id: outcome.telegramUserId,
    is_bot: false,
    first_name: name.firstName,
    last_name: name.lastName,
    username: name.username,
  });

  await startSession({ playerId: player.id, telegramUserId: outcome.telegramUserId });

  return NextResponse.redirect(new URL(outcome.returnTo, siteUrl()));
}

/** The reason goes to the log, never into the URL. */
function failed(reason: string): Response {
  console.warn(`[login] rejected: ${reason}`);
  return NextResponse.redirect(new URL("/login?error=1", siteUrl()));
}

import { NextResponse } from "next/server";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { ping } from "@/lib/repo/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily: touch the database so it does not fall asleep.
 *
 * Supabase pauses a free project after a week without user queries, and a paused
 * project does not wake on the next request — somebody has to restore it by hand
 * from the dashboard. The league's own crons leave a five-day gap between Thursday's
 * settle and Tuesday's poll, and four of those days see no queries at all. That is
 * inside the limit but not comfortably inside it, and the failure is silent: the
 * Tuesday poll simply never appears.
 *
 * One round trip a day removes the whole question. It is also the first thing to
 * check when the bot has gone quiet — if this route is failing, nothing else will
 * work either.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const players = await ping();

  return NextResponse.json({ ok: true, players });
}

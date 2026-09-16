import { NextResponse } from "next/server";
import { syncCommands } from "@/lib/bot/registration";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { ping } from "@/lib/repo/health";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily: touch the database so it does not fall asleep, and tell Telegram what the
 * commands are.
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
 *
 * The command sync rides along for the same reason the ping does: it is a thing that
 * has to keep happening, and leaving it to somebody remembering does not work. The
 * menu Telegram shows is a snapshot it holds, updated only by `setMyCommands`, and
 * nothing about deploying calls that — so the group's menu spent months advertising
 * six commands while the bot answered twelve. Now the worst it can be is a day out.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // First, and on its own: keeping the database awake is this route's real job, and a
  // Telegram outage must not be allowed to cost the league its Tuesday poll.
  const players = await ping();

  let commands = "synced";
  try {
    await syncCommands(telegramClient());
  } catch (error) {
    // Reported rather than thrown. A failed sync leaves yesterday's menu in place,
    // which is survivable; failing the request would mark the cron failed and, on a
    // free database, that is the silence this route exists to prevent. The body is
    // where anybody checking on a quiet bot is already looking.
    commands = `failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  return NextResponse.json({ ok: true, players, commands });
}

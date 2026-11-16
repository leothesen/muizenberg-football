import { NextResponse } from "next/server";
import { reportInviteKeyboard, reportReminderMessage } from "@/lib/bot/report-invite";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { fixtureAwaitingReports } from "@/lib/repo/fixtures";
import { reportFor } from "@/lib/repo/reports";
import { selectedPlayers, teamsFor } from "@/lib/repo/teams";
import { telegramClient } from "@/lib/telegram/factory";
import { fanOut } from "@/lib/telegram/fan-out";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A private reminder to everyone on the sheet who has not filed yet.
 *
 * Runs twice: 21:00 on match night, and `?last=1` at 08:30 the next morning as a last
 * call before results go up at 11:00. Half the squad typically never files, and a game
 * where nobody does goes down as a rumour, so this is worth one extra message each.
 *
 * Private messages only reach people who have opened a chat with the bot at some
 * point — Telegram lets a bot reply in a private chat, never start one. Everyone else
 * is counted as unreachable and skipped; the pinned group post is still there for them.
 *
 * Only reminds people who already have a report row, which is to say people the group
 * post has already asked. Before that post goes out there is nothing to remind about.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const lastCall = new URL(request.url).searchParams.get("last") === "1";

  const fixture = await fixtureAwaitingReports(new Date());
  if (!fixture) {
    return NextResponse.json({ ok: true, skipped: "no fixture awaiting reports" });
  }

  const owed: { telegramUserId: number; displayName: string }[] = [];
  for (const { players: player } of await selectedPlayers(fixture.id)) {
    const report = await reportFor(fixture.id, player.id);
    if (report && !report.submitted_at) {
      owed.push({ telegramUserId: player.telegram_user_id, displayName: player.display_name });
    }
  }

  if (owed.length === 0) {
    return NextResponse.json({ ok: true, fixtureId: fixture.id, skipped: "nobody left to remind" });
  }

  const sides = await teamsFor(fixture.id);
  const teams = {
    a: sides.find((t) => t.team.side === "a")?.team.name ?? "Team A",
    b: sides.find((t) => t.team.side === "b")?.team.name ?? "Team B",
  };
  const text = reportReminderMessage({ kickoffAt: new Date(fixture.kickoff_at), teams, lastCall });

  const client = telegramClient();
  const result = await fanOut(owed, (player) =>
    client
      .sendMessage({
        chat_id: player.telegramUserId,
        text,
        parse_mode: "HTML",
        reply_markup: reportInviteKeyboard(fixture.id),
      })
      .then(() => player.displayName),
  );

  return NextResponse.json({
    ok: true,
    fixtureId: fixture.id,
    lastCall,
    reminded: result.delivered,
    unreachable: result.unreachable,
    failed: result.failed,
    throttled: result.throttled,
  });
}

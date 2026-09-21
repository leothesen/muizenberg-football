import { NextResponse } from "next/server";
import { reportInviteKeyboard, reportInviteMessage } from "@/lib/bot/report-invite";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { fixtureAwaitingReports } from "@/lib/repo/fixtures";
import { ensureReport } from "@/lib/repo/reports";
import { selectedPlayers, teamsFor } from "@/lib/repo/teams";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Match night: ask everybody who played how it went.
 *
 * One message into the group, not a DM each. A bot may not open a private chat — it
 * can only reply in one somebody else started — and on the first real Wednesday not
 * one person on the team sheet had ever messaged the bot. The DMs this used to send
 * reached nobody, left no trace, and the morning after reported "no agreed score".
 *
 * The group needs no such permission. The message names everyone who played, and the
 * button under it hands each person who taps it their own questionnaire, visible only
 * to them (see `startQuestionnaire` in the router).
 *
 * A report row is opened for everyone on the sheet before anything is sent. The row is
 * what the button, the Mini App and settlement all resolve against, and it is the
 * record that somebody was owed a questionnaire — a night where nobody answered and a
 * night where nobody was asked are no longer indistinguishable in the database.
 *
 * Safe to run again: only people who have not filed are named, and nobody at all is
 * named once everybody has.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const fixture = await fixtureAwaitingReports(new Date());
  if (!fixture) {
    return NextResponse.json({ ok: true, skipped: "no fixture awaiting reports" });
  }

  const chatId = leagueChatId();
  if (!chatId) {
    return NextResponse.json({ ok: false, error: "no league chat configured" }, { status: 500 });
  }

  const players = await selectedPlayers(fixture.id);
  const owed: { telegramUserId: number; displayName: string }[] = [];
  const filed: string[] = [];

  for (const { players: player } of players) {
    const report = await ensureReport(fixture.id, player.id);

    if (report.submitted_at) filed.push(player.display_name);
    else {
      owed.push({ telegramUserId: player.telegram_user_id, displayName: player.display_name });
    }
  }

  if (owed.length === 0) {
    return NextResponse.json({
      ok: true,
      fixtureId: fixture.id,
      skipped: "everyone on the sheet has filed",
      filed,
    });
  }

  // The post asks for the score, so it names the two sides it is between.
  const sides = await teamsFor(fixture.id);
  const teams = {
    a: sides.find((t) => t.team.side === "a")?.team.name ?? "Team A",
    b: sides.find((t) => t.team.side === "b")?.team.name ?? "Team B",
  };

  const sent = await telegramClient().sendMessage({
    chat_id: chatId,
    text: reportInviteMessage({ kickoffAt: new Date(fixture.kickoff_at), teams, players: owed }),
    parse_mode: "HTML",
    reply_markup: reportInviteKeyboard(fixture.id),
  });

  return NextResponse.json({
    ok: true,
    fixtureId: fixture.id,
    selected: players.length,
    // Named, not counted: the version this replaced said "unreachable: 7" and nothing
    // else, which read the same whether nobody was asked or everybody had answered.
    invited: owed.map((p) => p.displayName),
    filed,
    messageId: sent.message_id,
  });
}

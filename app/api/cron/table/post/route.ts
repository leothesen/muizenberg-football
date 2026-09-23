import { NextResponse } from "next/server";
import { ratingTable } from "@/domain/leaderboards";
import { sendIllustrated } from "@/lib/bot/illustrate";
import { shareButton } from "@/lib/bot/messages";
import { tableCaption, tableMessage } from "@/lib/bot/results";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { leaderboardScene } from "@/lib/og/scenes";
import { renderPng } from "@/lib/og/render";
import { currentSeason } from "@/lib/repo/fixtures";
import { seasonTable } from "@/lib/repo/stats";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sunday morning: put the table in the group.
 *
 * The table used to reach the chat only when somebody pressed the button beside the
 * squad list, which meant it arrived at no particular time, as often as anybody felt
 * like it, and — because the button sits on the message a newcomer is welcomed with —
 * most often on the day somebody joined, which is the day it has least to say. The
 * button now answers privately (see `sendTable`) and this is the one post everybody
 * gets.
 *
 * Sunday because the week is over and the arguing is the point: every game that was
 * going to be played has been, and Monday's poll is a day away rather than stacked
 * against it. Morning because that is when a phone is read in bed.
 *
 * Deliberately not pinned. The pin is for the thing to do next and the week already
 * has one — the match report holds it until Monday. A league table is to read, not
 * to answer.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const chatId = leagueChatId();
  if (!chatId) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_LEAGUE_CHAT_ID is not set" },
      { status: 500 },
    );
  }

  const season = await currentSeason();
  const rows = season ? await seasonTable(season.id) : [];
  const table = ratingTable(rows);

  /*
    A table is a standing, and a standing needs a result to stand on.

    Not "has anybody played": `ratingTable` already drops anybody who has not, and a
    group can have a game each and the table still say nothing. A fixture where nobody
    agreed the score settles with no outcome, so every W, D and L stays at nought and
    every rating stays on the 65 it started at — which is precisely the table the group
    got on the day somebody joined and pressed the button: seven names, one number,
    "no games yet" beside each.

    `every` on an empty table is true, which is the same answer for the same reason.
  */
  if (table.every((row) => row.wins + row.draws + row.losses === 0)) {
    return NextResponse.json({
      ok: true,
      skipped: "no results to stand on yet",
      season: season?.name ?? null,
    });
  }

  const seasonName = season?.name ?? "The table";

  const sent = await sendIllustrated(
    { client: telegramClient(), render: renderPng },
    {
      chatId,
      text: tableMessage(table, seasonName),
      caption: tableCaption(table, seasonName),
      // The one message people want to show somebody who is not in the group.
      replyMarkup: { inline_keyboard: [[shareButton()]] },
    },
    await leaderboardScene(),
  );

  return NextResponse.json({
    ok: true,
    season: seasonName,
    players: table.length,
    messageId: sent.message.message_id,
    illustrated: sent.illustrated,
  });
}

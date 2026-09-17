import { NextResponse } from "next/server";
import { firstState, openingMessage, questionFor } from "@/lib/bot/report-flow";
import { questionContext } from "@/lib/bot/report-services";
import { chaseKeyboard, chaseMessage } from "@/lib/bot/report-chase";
import { miniAppUrl, resolveBotUsername } from "@/lib/bot/registration";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId, optionalEnv, siteUrl } from "@/lib/env";
import { cachedBotUsername, rememberBotUsername } from "@/lib/repo/bot-identity";
import { fixtureAwaitingReports } from "@/lib/repo/fixtures";
import { ensureReport, setFlowState } from "@/lib/repo/reports";
import { selectedPlayers } from "@/lib/repo/teams";
import { fanOut, skip } from "@/lib/telegram/fan-out";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Match night: ask everybody who played how it went.
 *
 * Sent as a DM rather than into the group, because the questions are personal and
 * because twenty people answering in the group would be unreadable.
 *
 * The DM is not always available. A bot may not open a conversation — only reply in
 * one somebody else started — so anyone who has never messaged this bot has no
 * `private_chat_id` and cannot be sent anything privately. That used to end their
 * night here, in one line, with no record: they were counted as "unreachable"
 * alongside people who had already answered, and the count went nowhere but the
 * response body. A game where nobody was asked and a game where everybody had
 * already replied looked identical, and the morning after reported no agreed score
 * as though the squad had simply not bothered.
 *
 * Now the report row is opened for everyone selected, whether or not they can be
 * reached — so the database says who was owed a questionnaire — and anybody the DM
 * cannot reach is chased in the group instead, with a deep link that starts the
 * private chat and a Mini App that does not need one.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const now = new Date();
  const fixture = await fixtureAwaitingReports(now);
  if (!fixture) {
    return NextResponse.json({ ok: true, skipped: "no fixture awaiting reports" });
  }

  const client = telegramClient();
  const players = await selectedPlayers(fixture.id);
  const chatId = leagueChatId();

  const botUsername = await resolveBotUsername(
    client,
    { cached: cachedBotUsername, remember: rememberBotUsername },
    optionalEnv("TELEGRAM_BOT_USERNAME"),
  );
  const app = miniAppUrl(siteUrl());

  let chased = 0;

  // Paced rather than fired all at once: a dozen DMs in a tight loop is exactly the
  // shape Telegram throttles, and a 429 halfway through would leave the rest of the
  // squad unasked with no record of who was missed.
  const result = await fanOut(players, async (entry) => {
    const player = entry.players;
    const who = player.display_name ?? player.id;

    // Opened before the reachability check, deliberately. The row is the record that
    // this player was owed a questionnaire on this fixture, and it is what the deep
    // link and the Mini App both resolve against later — without it, somebody who
    // says hello an hour after the game has nothing waiting for them.
    const report = await ensureReport(fixture.id, player.id);
    if (report.submitted_at) return skip("already filed", who);

    const context = await questionContext(fixture.id, player.id);
    const question = context ? questionFor(firstState(), context) : null;
    if (!question) return skip("no team sheet", who);

    if (!player.private_chat_id) {
      // Telegram will not let the bot message them first. Say so where they will see
      // it, rather than dropping them.
      if (!chatId) return skip("no private chat, and no group to chase them in", who);

      await client.sendEphemeral(
        chatId,
        player.telegram_user_id,
        chaseMessage(player.display_name ?? "You"),
        { replyMarkup: chaseKeyboard({ botUsername, miniAppUrl: app }) },
      );
      chased += 1;
      return skip("no private chat — chased in the group", who);
    }

    await client.sendMessage({
      chat_id: player.private_chat_id,
      text: openingMessage(player.display_name),
      parse_mode: "HTML",
    });

    const sent = await client.sendMessage({
      chat_id: player.private_chat_id,
      text: question.text,
      parse_mode: "HTML",
      reply_markup: question.keyboard,
    });

    // Remember which message to rewrite as they answer.
    await setFlowState(report.id, firstState(), sent.message_id);
    return player.id;
  });

  return NextResponse.json({
    ok: true,
    fixtureId: fixture.id,
    selected: players.length,
    asked: result.delivered.length,
    chased,
    // Named, not just counted. The old response said "unreachable: 7" for a night
    // where nobody was asked and for one where everybody had already answered.
    skipped: result.skipped,
    unreachable: result.unreachable,
    failed: result.failed,
    throttled: result.throttled,
  });
}

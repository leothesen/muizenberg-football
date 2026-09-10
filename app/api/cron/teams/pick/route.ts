import { createElement } from "react";
import { NextResponse } from "next/server";
import { minimumViable, squadHealth } from "@/domain/squad";
import { pickTeams } from "@/domain/teams";
import { sendIllustrated } from "@/lib/bot/illustrate";
import { copyVenueButton } from "@/lib/bot/messages";
import { teamSheetCaption } from "@/lib/bot/results";
import { balanceNote, notEnoughPlayersMessage, teamSheetMessage } from "@/lib/bot/team-sheet";
import { teamSheetProps } from "@/lib/og/props";
import { renderPng } from "@/lib/og/render";
import { TeamSheetImage, teamSheetSize } from "@/lib/og/team-sheet-image";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { openFixture, setFixtureStatus } from "@/lib/repo/fixtures";
import { commitmentsFor, shapeOf } from "@/lib/repo/rsvps";
import { attachTeamsMessage, saveTeams } from "@/lib/repo/teams";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Match-day midday: close the poll and pick the sides.
 *
 * This is also where a game gets called off. Doing that at lunchtime rather than at
 * six o'clock is the whole point — people can still make other plans.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const chatId = leagueChatId();
  const fixture = await openFixture();

  if (!fixture || !chatId) {
    return NextResponse.json({ ok: true, skipped: "no open fixture" });
  }

  if (fixture.teams_message_id) {
    return NextResponse.json({ ok: true, skipped: "teams already posted", fixtureId: fixture.id });
  }

  const shape = shapeOf(fixture);
  const commitments = await commitmentsFor(fixture.id);
  const health = squadHealth(commitments, shape);
  const client = telegramClient();
  const kickoffAt = new Date(fixture.kickoff_at);

  if (!health.viable) {
    await setFixtureStatus(fixture.id, "cancelled", "not enough players");
    await client.sendMessage({
      chat_id: chatId,
      text: notEnoughPlayersMessage({
        confirmed: health.confirmed,
        needed: minimumViable(shape),
        kickoffAt,
      }),
      parse_mode: "HTML",
    });
    return NextResponse.json({ ok: true, cancelled: true, confirmed: health.confirmed });
  }

  const teams = pickTeams(commitments, shape);
  await saveTeams(fixture.id, teams);

  const props = teamSheetProps({
    teams,
    kickoffAt,
    venue: fixture.venue,
    balanceNote: balanceNote(teams.ratingGap),
  });

  const sent = await sendIllustrated(
    { client, render: renderPng },
    {
      chatId,
      text: teamSheetMessage({ teams, kickoffAt, venue: fixture.venue }),
      caption: teamSheetCaption({ kickoffAt, venue: fixture.venue }),
      // The one message where somebody needs the venue in their hand rather than on
      // their screen — a tap beats retyping it into a maps app.
      replyMarkup: { inline_keyboard: [[copyVenueButton(fixture.venue)]] },
    },
    {
      element: createElement(TeamSheetImage, props),
      size: teamSheetSize(props),
    },
  );

  // Locks the fixture: no more RSVP changes once the sides are out.
  await attachTeamsMessage(fixture.id, sent.message.message_id);

  return NextResponse.json({
    ok: true,
    fixtureId: fixture.id,
    ratingGap: Number(teams.ratingGap.toFixed(2)),
    a: teams.a.starters.length + teams.a.subs.length,
    b: teams.b.starters.length + teams.b.subs.length,
    illustrated: sent.illustrated,
  });
}

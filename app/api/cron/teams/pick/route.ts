import { createElement } from "react";
import { NextResponse } from "next/server";
import { formatFor } from "@/domain/formats";
import { squadHealth } from "@/domain/squad";
import { pickTeams } from "@/domain/teams";
import { sendIllustrated } from "@/lib/bot/illustrate";
import { venueButton } from "@/lib/bot/messages";
import { venueOfFixture } from "@/domain/venues";
import { scheduleFor } from "@/domain/schedule";
import { teamSheetCaption } from "@/lib/bot/results";
import { kickaboutMessage, teamSheetMessage } from "@/lib/bot/team-sheet";
import { teamSheetProps } from "@/lib/og/props";
import { renderPng } from "@/lib/og/render";
import { TeamSheetImage, teamSheetSize } from "@/lib/og/team-sheet-image";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { openFixture } from "@/lib/repo/fixtures";
import { commitmentsFor, shapeOf } from "@/lib/repo/rsvps";
import { attachTeamsMessage, saveTeams } from "@/lib/repo/teams";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Match-day midday: close the poll and pick the sides.
 *
 * Nothing here calls a game off any more. It used to, below a threshold, and that was
 * the one outcome that made the following week worse — the people who had answered
 * got nothing for it, and the lesson they took was that answering is a gamble. The
 * turnout now decides the *format* instead: five people is a three-and-two, not a
 * failed eleven-a-side, and saying so at lunchtime still leaves anybody time to make
 * other plans if a rondo is not what they fancied.
 *
 * The only floor is two, because one person cannot be split into two sides — and even
 * then the fixture stays open rather than dying.
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

  // Runs daily and works out for itself whether today is match day, rather than being
  // pinned to a Wednesday in vercel.json. Picking sides early would freeze the squad
  // a day before anybody meant to stop answering.
  const now = new Date();
  const closesAt = fixture.rsvp_closes_at
    ? new Date(fixture.rsvp_closes_at)
    : scheduleFor(new Date(fixture.kickoff_at)).rsvpClosesAt;

  if (now < closesAt) {
    return NextResponse.json({
      ok: true,
      skipped: "the squad is still open",
      fixtureId: fixture.id,
      closesAt: closesAt.toISOString(),
    });
  }

  const shape = shapeOf(fixture);
  const commitments = await commitmentsFor(fixture.id);
  const health = squadHealth(commitments, shape);
  const client = telegramClient();
  const kickoffAt = new Date(fixture.kickoff_at);

  // The turnout decides what is played, never whether. A thin Wednesday used to be
  // cancelled here, which is the one outcome that makes the next one worse: the
  // people who did answer got nothing, and the lesson was that answering is a gamble.
  const format = formatFor(health.confirmed, shape);

  if (!format.playable) {
    // Under two, there is genuinely nothing to split into sides. Still not a
    // cancellation — the fixture stays open, and whoever turned up gets told what
    // they can do with a ball on their own.
    await client.sendMessage({
      chat_id: chatId,
      text: kickaboutMessage({ confirmed: health.confirmed, format, kickoffAt }),
      parse_mode: "HTML",
    });
    return NextResponse.json({
      ok: true,
      tooFewForSides: true,
      confirmed: health.confirmed,
      format: format.label,
    });
  }

  const teams = pickTeams(commitments, shape);
  await saveTeams(fixture.id, teams);

  const props = teamSheetProps({
    teams,
    kickoffAt,
    venue: fixture.venue,
  });

  const sent = await sendIllustrated(
    { client, render: renderPng },
    {
      chatId,
      text: teamSheetMessage({ teams, kickoffAt, venue: fixture.venue, format }),
      caption: teamSheetCaption({ kickoffAt, venue: fixture.venue, format }),
      // The one message where somebody needs the venue in their hand rather than on
      // their screen — a tap into the maps app beats retyping a name into one.
      replyMarkup: { inline_keyboard: [[venueButton(venueOfFixture(fixture))]] },
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

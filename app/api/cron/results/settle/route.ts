import { createElement } from "react";
import { NextResponse } from "next/server";
import { settleFixture } from "@/domain/settle";
import { sendIllustrated } from "@/lib/bot/illustrate";
import { matchReportCaption, matchReportMessage } from "@/lib/bot/results";
import { MatchReportImage, matchReportSize } from "@/lib/og/match-report-image";
import { matchReportProps } from "@/lib/og/props";
import { renderPng } from "@/lib/og/render";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import {
  applySettlement,
  fixtureAwaitingSettlement,
  settlementContextFor,
} from "@/lib/repo/settlement";
import { badgeCatalogue } from "@/lib/repo/stats";
import { teamsFor } from "@/lib/repo/teams";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The morning after: turn the night's reports into a result.
 *
 * Deliberately late enough that anyone who answered from bed is counted, and early
 * enough that the argument about the score is still worth having. Everything it does
 * is safe to repeat, so a retry after a timeout is harmless.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronRequestIsAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const fixture = await fixtureAwaitingSettlement(new Date());
  if (!fixture) {
    return NextResponse.json({ ok: true, skipped: "nothing to settle" });
  }

  const context = await settlementContextFor(fixture.id);
  if (!context) {
    return NextResponse.json({ ok: true, skipped: "no teams on that fixture" });
  }

  const settlement = settleFixture(context);
  const applied = await applySettlement(fixture.id, settlement);

  const [teams, badges] = await Promise.all([teamsFor(fixture.id), badgeCatalogue()]);
  const teamNames = {
    a: teams.find((t) => t.team.side === "a")?.team.name ?? "Team A",
    b: teams.find((t) => t.team.side === "b")?.team.name ?? "Team B",
  };

  const chatId = leagueChatId();
  let posted = false;
  let illustrated = false;

  if (chatId) {
    const kickoffAt = new Date(fixture.kickoff_at);
    const props = matchReportProps(settlement, {
      kickoffAt,
      teamA: {
        name: teamNames.a,
        colour: teams.find((t) => t.team.side === "a")?.team.colour ?? "hut-yellow",
      },
      teamB: {
        name: teamNames.b,
        colour: teams.find((t) => t.team.side === "b")?.team.colour ?? "hut-blue",
      },
    });

    const sent = await sendIllustrated(
      { client: telegramClient(), render: renderPng },
      {
        chatId,
        text: matchReportMessage(settlement, {
          kickoffAt,
          teamNames,
          badgeNames: new Map(
            badges.map((b) => [b.code, { name: b.name, emoji: b.emoji, tier: b.tier }]),
          ),
        }),
        caption: matchReportCaption(settlement, teamNames),
      },
      { element: createElement(MatchReportImage, props), size: matchReportSize(props) },
    );

    posted = true;
    illustrated = sent.illustrated;
  }

  return NextResponse.json({
    ok: true,
    fixtureId: fixture.id,
    score: settlement.score,
    reported: settlement.reportedCount,
    of: settlement.players.length,
    motm: settlement.motm.map((m) => m.displayName),
    posted,
    illustrated,
    ...applied,
  });
}

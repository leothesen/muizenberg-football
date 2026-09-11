import { NextResponse } from "next/server";
import { kickoffOn, resolveNights, weekStart, type NightOption } from "@/domain/nights";
import { scheduleFor } from "@/domain/schedule";
import { nightsResolvedMessage } from "@/lib/bot/night-poll";
import { cronRequestIsAuthorised } from "@/lib/cron-auth";
import { leagueChatId } from "@/lib/env";
import { ensureFixture, ensureSeason } from "@/lib/repo/fixtures";
import { markNightsResolved, nightPoll, votesForWeek } from "@/lib/repo/nights";
import { telegramClient } from "@/lib/telegram/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tuesday morning: read the votes and book the week.
 *
 * A day after the poll goes up, which is late enough that most people have seen it
 * and early enough to still play on a Tuesday evening if that is what won.
 *
 * There is always a weeknight fixture. A poll nobody answered resolves to the usual
 * night rather than to nothing — that default is the entire reason this is safe to
 * build, because the commonest outcome in a group of 38 is silence, and silence must
 * not mean a dead week. A weekend fixture appears only when enough people asked.
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

  const now = new Date();
  const week = weekStart(now);
  const poll = await nightPoll(week);

  if (poll?.resolved_at) {
    return NextResponse.json({ ok: true, skipped: "already resolved", week });
  }

  const outcome = resolveNights(await votesForWeek(week));
  const season = await ensureSeason(now);

  const weeknight = await book(outcome.weeknight, now, season.id);
  const weekend = outcome.weekend ? await book(outcome.weekend, now, season.id) : null;

  // Marked before announcing. A failed send is recoverable — somebody asks /next —
  // whereas a second run booking the same week again is not, and the fixtures are
  // already written by this point.
  await markNightsResolved(week);

  await telegramClient().sendMessage({
    chat_id: chatId,
    text: nightsResolvedMessage({
      outcome,
      weeknightKickoff: weeknight.kickoffAt,
      weekendKickoff: weekend?.kickoffAt ?? null,
    }),
    parse_mode: "HTML",
  });

  return NextResponse.json({
    ok: true,
    week,
    byDefault: outcome.byDefault,
    weeknight: { night: outcome.weeknight.key, kickoffAt: weeknight.kickoffAt.toISOString() },
    weekend: outcome.weekend
      ? { night: outcome.weekend.key, kickoffAt: weekend!.kickoffAt.toISOString() }
      : null,
  });
}

async function book(
  option: NightOption,
  now: Date,
  seasonId: string,
): Promise<{ kickoffAt: Date; fixtureId: string }> {
  const kickoffAt = kickoffOn(option, now);

  // ensureFixture is keyed on the kickoff instant, so booking a night that already has
  // a fixture — because somebody called one, or because last week's vote landed on the
  // same slot — returns the existing one rather than colliding.
  const { fixture } = await ensureFixture({
    seasonId,
    kickoffAt,
    rsvpClosesAt: scheduleFor(kickoffAt).rsvpClosesAt,
  });

  return { kickoffAt, fixtureId: fixture.id };
}

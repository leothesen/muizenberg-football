import { NextResponse } from "next/server";
import { currentPlayer, endSession } from "@/lib/auth/current-user";
import { buildPlayerCard, blankCard } from "@/lib/bot/fantasy";
import { careerTable, recentForm, badgesFor } from "@/lib/repo/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who am I, and what does my card say.
 *
 * Deliberately one call: the Mini App's first paint wants both, and two round trips
 * over a phone connection inside a Telegram webview is a visible pause.
 */
export async function GET(): Promise<Response> {
  const player = await currentPlayer();
  if (!player) return NextResponse.json({ ok: false, signedIn: false }, { status: 401 });

  const [career, form, badges] = await Promise.all([
    careerTable(),
    recentForm(player.id),
    badgesFor(player.id),
  ]);

  const mine = career.find((row) => row.playerId === player.id);
  const card = mine
    ? buildPlayerCard({
        career: mine,
        form: form.map((f) => ({ outcome: f.outcome, delta: f.delta })),
        badges: badges.map((b) => ({ emoji: b.emoji, name: b.name })),
      })
    : blankCard({
        displayName: player.display_name,
        emoji: player.emoji,
        rating: Number(player.rating),
      });

  return NextResponse.json({
    ok: true,
    signedIn: true,
    player: {
      id: player.id,
      displayName: player.display_name,
      emoji: player.emoji,
      rating: Number(player.rating),
    },
    card,
  });
}

export async function DELETE(): Promise<Response> {
  await endSession();
  return NextResponse.json({ ok: true, signedIn: false });
}

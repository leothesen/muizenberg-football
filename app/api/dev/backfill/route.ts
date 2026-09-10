import { NextResponse } from "next/server";
import { devToolsEnabled } from "@/lib/dev-guard";
import { backfillSettlements, unsettledFixtures } from "@/lib/repo/backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Replays the fantasy engine over fixtures that were played before it existed.
 *
 * Development only, and never posts anything to the chat: it is a data operation,
 * not a bot action, and nobody wants four months of match reports arriving at once.
 * GET reports what would be replayed; POST does it.
 */
export async function GET(): Promise<Response> {
  if (!devToolsEnabled()) {
    return NextResponse.json({ ok: false, error: "not available" }, { status: 404 });
  }

  const pending = await unsettledFixtures();
  return NextResponse.json({ ok: true, pending: pending.length, fixtures: pending });
}

export async function POST(): Promise<Response> {
  if (!devToolsEnabled()) {
    return NextResponse.json({ ok: false, error: "not available" }, { status: 404 });
  }

  const results = await backfillSettlements();

  return NextResponse.json({
    ok: true,
    settled: results.length,
    rated: results.reduce((sum, r) => sum + r.rated, 0),
    badgesAwarded: results.reduce((sum, r) => sum + r.badgesAwarded, 0),
    results,
  });
}

import { NextResponse } from "next/server";
import { fixtureById } from "@/lib/repo/fixtures";
import { imageResponse } from "@/lib/og/render";
import { teamSheetScene } from "@/lib/og/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fixtureId: string }> },
): Promise<Response> {
  const { fixtureId } = await params;
  const fixture = await fixtureById(fixtureId);

  if (!fixture) {
    return NextResponse.json({ error: "no such fixture" }, { status: 404 });
  }

  const scene = await teamSheetScene({
    fixtureId,
    kickoffAt: new Date(fixture.kickoff_at),
    venue: fixture.venue,
    // The gap is not stored, so a sheet rendered after the fact leaves it out rather
    // than recomputing a number from ratings that have since moved on.
  });

  if (!scene) {
    return NextResponse.json({ error: "that fixture has no teams" }, { status: 404 });
  }

  return imageResponse(scene.element, scene.size);
}

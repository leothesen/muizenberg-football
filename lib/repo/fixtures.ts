import { db } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { FixtureRow } from "./mappers";

type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];

export async function currentSeason(): Promise<SeasonRow | null> {
  const { data, error } = await db()
    .from("seasons")
    .select("*")
    .is("ended_on", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** There must always be a season to hang fixtures off; make one if there is not. */
export async function ensureSeason(now: Date): Promise<SeasonRow> {
  const existing = await currentSeason();
  if (existing) return existing;

  const year = now.getUTCFullYear();
  const { data, error } = await db()
    .from("seasons")
    .insert({
      name: `${seasonNameFor(now)} ${year}`,
      started_on: now.toISOString().slice(0, 10),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** Southern hemisphere seasons, since the league is in Cape Town. */
function seasonNameFor(now: Date): string {
  const month = now.getUTCMonth();
  if (month <= 1 || month === 11) return "Summer";
  if (month <= 4) return "Autumn";
  if (month <= 7) return "Winter";
  return "Spring";
}

export async function fixtureById(id: string): Promise<FixtureRow | null> {
  const { data, error } = await db().from("fixtures").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** The fixture currently taking RSVPs, if any. */
export async function openFixture(): Promise<FixtureRow | null> {
  const { data, error } = await db()
    .from("fixtures")
    .select("*")
    .in("status", ["scheduled", "open"])
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fixtureByKickoff(kickoffAt: Date): Promise<FixtureRow | null> {
  const { data, error } = await db()
    .from("fixtures")
    .select("*")
    .eq("kickoff_at", kickoffAt.toISOString())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Idempotent by kickoff time: the unique index means a cron that fires twice cannot
 * create two fixtures for the same Wednesday.
 */
export async function ensureFixture(params: {
  seasonId: string;
  kickoffAt: Date;
  rsvpClosesAt: Date;
}): Promise<{ fixture: FixtureRow; created: boolean }> {
  const existing = await fixtureByKickoff(params.kickoffAt);
  if (existing) return { fixture: existing, created: false };

  const { data, error } = await db()
    .from("fixtures")
    .insert({
      season_id: params.seasonId,
      kickoff_at: params.kickoffAt.toISOString(),
      rsvp_closes_at: params.rsvpClosesAt.toISOString(),
      status: "scheduled",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await fixtureByKickoff(params.kickoffAt);
      if (raced) return { fixture: raced, created: false };
    }
    throw error;
  }

  return { fixture: data, created: true };
}

export async function attachRsvpMessage(
  fixtureId: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  const { error } = await db()
    .from("fixtures")
    .update({ rsvp_chat_id: chatId, rsvp_message_id: messageId, status: "open" })
    .eq("id", fixtureId);
  if (error) throw error;
}

export async function setFixtureStatus(
  fixtureId: string,
  status: "scheduled" | "open" | "locked" | "played" | "cancelled",
  cancelledReason?: string,
): Promise<void> {
  const { error } = await db()
    .from("fixtures")
    .update({ status, cancelled_reason: cancelledReason ?? null })
    .eq("id", fixtureId);
  if (error) throw error;
}

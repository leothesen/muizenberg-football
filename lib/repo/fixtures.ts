import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { fixtures, seasons } from "@/lib/db/schema";
import type { Venue } from "@/domain/venues";
import type { FixtureRow } from "./mappers";

export type SeasonRow = typeof seasons.$inferSelect;

export async function currentSeason(): Promise<SeasonRow | null> {
  const [row] = await db()
    .select()
    .from(seasons)
    .where(isNull(seasons.ended_on))
    .limit(1);

  return row ?? null;
}

/** There must always be a season to hang fixtures off; make one if there is not. */
export async function ensureSeason(now: Date): Promise<SeasonRow> {
  const existing = await currentSeason();
  if (existing) return existing;

  const year = now.getUTCFullYear();
  const [created] = await db()
    .insert(seasons)
    .values({
      name: `${seasonNameFor(now)} ${year}`,
      started_on: now.toISOString().slice(0, 10),
    })
    .returning();

  return created!;
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
  const [row] = await db()
    .select()
    .from(fixtures)
    .where(eq(fixtures.id, id))
    .limit(1);

  return (row as FixtureRow) ?? null;
}

/** The fixture currently taking RSVPs, if any. */
export async function openFixture(): Promise<FixtureRow | null> {
  const [row] = await db()
    .select()
    .from(fixtures)
    .where(inArray(fixtures.status, ["scheduled", "open"]))
    .orderBy(asc(fixtures.kickoff_at))
    .limit(1);

  return (row as FixtureRow) ?? null;
}

export async function fixtureByKickoff(
  kickoffAt: Date,
): Promise<FixtureRow | null> {
  const [row] = await db()
    .select()
    .from(fixtures)
    .where(eq(fixtures.kickoff_at, kickoffAt.toISOString()))
    .limit(1);

  return (row as FixtureRow) ?? null;
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

  // Two crons firing at once both pass the check above. The unique index settles it,
  // and `onConflictDoNothing` turns the loser's insert into zero rows rather than an
  // error — so the loser simply reads the winner's fixture, exactly as before.
  const [created] = await db()
    .insert(fixtures)
    .values({
      season_id: params.seasonId,
      kickoff_at: params.kickoffAt.toISOString(),
      rsvp_closes_at: params.rsvpClosesAt.toISOString(),
      status: "scheduled",
    })
    .onConflictDoNothing({ target: fixtures.kickoff_at })
    .returning();

  if (created) return { fixture: created as FixtureRow, created: true };

  const raced = await fixtureByKickoff(params.kickoffAt);
  if (raced) return { fixture: raced, created: false };

  throw new Error(
    `could not create a fixture for ${params.kickoffAt.toISOString()}: insert was refused but no row exists`,
  );
}

export async function attachRsvpMessage(
  fixtureId: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  await db()
    .update(fixtures)
    .set({ rsvp_chat_id: chatId, rsvp_message_id: messageId, status: "open" })
    .where(eq(fixtures.id, fixtureId));
}

/**
 * Move a fixture to a different place.
 *
 * Anybody in the group can do this, so it is deliberately an update rather than a
 * request: the last person to say where the game is, is right. Coordinates are stored
 * only when the venue actually has them — a name with no pin writes nulls over any
 * previous pin, which is correct, because the old pin belonged to the old place.
 */
export async function setVenue(fixtureId: string, venue: Venue): Promise<void> {
  await db()
    .update(fixtures)
    .set({
      venue: venue.name,
      // numeric columns take a string; passing a JS number here rounds at the driver
      // and drops the sixth decimal, which is about ten centimetres of pitch.
      venue_lat: venue.lat === null ? null : String(venue.lat),
      venue_lon: venue.lon === null ? null : String(venue.lon),
      venue_url: venue.mapsUrl,
    })
    .where(eq(fixtures.id, fixtureId));
}

export async function setFixtureStatus(
  fixtureId: string,
  status: "scheduled" | "open" | "locked" | "played" | "cancelled",
  cancelledReason?: string,
): Promise<void> {
  await db()
    .update(fixtures)
    .set({ status, cancelled_reason: cancelledReason ?? null })
    .where(eq(fixtures.id, fixtureId));
}

/**
 * The fixture whose players should now be asked how it went: locked (so teams were
 * picked) and kicked off long enough ago that the game is over.
 */
export async function fixtureAwaitingReports(
  now: Date,
  afterHours = 2,
): Promise<FixtureRow | null> {
  const cutoff = new Date(now.getTime() - afterHours * 60 * 60 * 1000);

  const [row] = await db()
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.status, "locked"),
        lte(fixtures.kickoff_at, cutoff.toISOString()),
      ),
    )
    .orderBy(desc(fixtures.kickoff_at))
    .limit(1);

  return (row as FixtureRow) ?? null;
}

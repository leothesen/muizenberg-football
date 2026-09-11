import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { nightPolls, nightVotes } from "@/lib/db/schema";

/**
 * Votes on which night to play.
 *
 * A vote is a row, a week is a date, and a person may hold several at once —
 * "Wednesday or Thursday" is the commonest honest answer and the schema is built to
 * take it rather than force a choice.
 */

export interface NightVoteRow {
  player_id: string;
  night: string;
}

/**
 * Cast or withdraw one vote.
 *
 * Tapping a night you already picked takes it back, because the same button has to
 * mean both things: the keyboard has one row per night and no room for a separate
 * undo, and a vote you cannot withdraw is one people hesitate before casting.
 *
 * Returns what the vote now is, so the caller can say so without re-reading.
 */
export async function toggleNightVote(params: {
  weekStart: string;
  playerId: string;
  night: string;
}): Promise<{ voted: boolean }> {
  const deleted = await db()
    .delete(nightVotes)
    .where(
      and(
        eq(nightVotes.week_start, params.weekStart),
        eq(nightVotes.player_id, params.playerId),
        eq(nightVotes.night, params.night),
      ),
    )
    .returning({ id: nightVotes.id });

  if (deleted.length > 0) return { voted: false };

  // onConflictDoNothing rather than an error: two taps racing each other should leave
  // one vote, not a 500 in a group chat.
  await db()
    .insert(nightVotes)
    .values({
      week_start: params.weekStart,
      player_id: params.playerId,
      night: params.night,
    })
    .onConflictDoNothing();

  return { voted: true };
}

export async function votesForWeek(weekStart: string): Promise<NightVoteRow[]> {
  const rows = await db()
    .select({ player_id: nightVotes.player_id, night: nightVotes.night })
    .from(nightVotes)
    .where(eq(nightVotes.week_start, weekStart));

  return rows as NightVoteRow[];
}

export interface NightPollRow {
  week_start: string;
  chat_id: number | null;
  message_id: number | null;
  resolved_at: string | null;
}

export async function nightPoll(weekStart: string): Promise<NightPollRow | null> {
  const [row] = await db()
    .select()
    .from(nightPolls)
    .where(eq(nightPolls.week_start, weekStart));

  return (row as NightPollRow) ?? null;
}

/**
 * Remember the poll message so the tally can be edited into it as votes arrive.
 *
 * Idempotent on the week: a cron that fires twice must not produce two polls, and the
 * first message posted is the one that stays — `created` tells the caller whether it
 * won, so a loser can delete the message it just sent.
 */
export async function claimNightPoll(params: {
  weekStart: string;
  chatId: number;
  messageId: number;
}): Promise<{ created: boolean }> {
  const inserted = await db()
    .insert(nightPolls)
    .values({
      week_start: params.weekStart,
      chat_id: params.chatId,
      message_id: params.messageId,
    })
    .onConflictDoNothing({ target: nightPolls.week_start })
    .returning({ week: nightPolls.week_start });

  return { created: inserted.length > 0 };
}

/** Mark a week's votes as turned into fixtures, so nothing books it twice. */
export async function markNightsResolved(weekStart: string): Promise<void> {
  await db()
    .update(nightPolls)
    .set({ resolved_at: sql`now()` })
    .where(eq(nightPolls.week_start, weekStart));
}

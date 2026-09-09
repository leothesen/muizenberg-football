/**
 * Domain types.
 *
 * These are deliberately independent of the database row shapes. Everything in
 * `domain/` is pure: no Supabase client, no network, no clock reads that are not
 * passed in. That is what makes the interesting rules cheap to test.
 */

export type Position = "gk" | "def" | "mid" | "att" | "anywhere";

export type RsvpStatus = "in" | "out" | "maybe";

export type Side = "a" | "b";

export type Outcome = "win" | "draw" | "loss";

export interface PlayerLike {
  id: string;
  displayName: string;
  emoji: string;
  rating: number;
  preferredPosition: Position;
}

/** A player who has said yes, with the moment they committed. */
export interface Commitment {
  player: PlayerLike;
  /** When they most recently said "in". Ordering key for the waitlist. */
  inSince: Date;
}

export interface SquadShape {
  playersPerTeam: number;
  subsPerTeam: number;
}

export interface MatchStatLine {
  goals: number;
  assists: number;
  nutmegs: number;
  tackles: number;
  saves: number;
  ownGoals: number;
  motmVotes: number;
}

export const EMPTY_STAT_LINE: MatchStatLine = {
  goals: 0,
  assists: 0,
  nutmegs: 0,
  tackles: 0,
  saves: 0,
  ownGoals: 0,
  motmVotes: 0,
};

import type { Commitment, RsvpStatus } from "@/domain/types";
import type { Venue } from "@/domain/venues";
import * as fixturesRepo from "@/lib/repo/fixtures";
import type { FixtureRow, FixtureRsvpView, PlayerRow } from "@/lib/repo/mappers";
import * as playersRepo from "@/lib/repo/players";
import * as rsvpsRepo from "@/lib/repo/rsvps";
import * as updatesRepo from "@/lib/repo/updates";
import type { TelegramUser } from "@/lib/telegram/types";

/**
 * Everything the bot handlers need from the outside world, behind one interface.
 *
 * Handlers take this rather than importing the repositories directly, so the whole
 * update-handling path can be exercised in tests with fakes — no database, no
 * network — while production wires in the real thing.
 */
export interface BotServices {
  claimUpdate(updateId: number, kind: string): Promise<boolean>;
  ensurePlayer(
    user: TelegramUser,
    options?: { privateChatId?: number },
  ): Promise<{ player: PlayerRow; isNew: boolean }>;
  findPlayerByTelegramId(telegramUserId: number): Promise<PlayerRow | null>;
  deactivatePlayer(telegramUserId: number): Promise<void>;
  openFixture(): Promise<FixtureRow | null>;
  fixtureById(id: string): Promise<FixtureRow | null>;
  setRsvp(fixtureId: string, playerId: string, status: RsvpStatus): Promise<void>;
  listRsvps(fixtureId: string): Promise<FixtureRsvpView[]>;
  commitmentsFor(fixtureId: string): Promise<Commitment[]>;
  markPromoted(fixtureId: string, playerIds: string[]): Promise<void>;
  setVenue(fixtureId: string, venue: Venue): Promise<void>;
}

export function liveServices(): BotServices {
  return {
    claimUpdate: updatesRepo.claimUpdate,
    ensurePlayer: playersRepo.ensurePlayer,
    findPlayerByTelegramId: playersRepo.findPlayerByTelegramId,
    deactivatePlayer: playersRepo.deactivatePlayer,
    openFixture: fixturesRepo.openFixture,
    fixtureById: fixturesRepo.fixtureById,
    setRsvp: rsvpsRepo.setRsvp,
    listRsvps: rsvpsRepo.listRsvps,
    commitmentsFor: rsvpsRepo.commitmentsFor,
    markPromoted: rsvpsRepo.markPromoted,
    setVenue: fixturesRepo.setVenue,
  };
}

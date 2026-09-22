import type { TelegramClient } from "@/lib/telegram/client";

/**
 * One pin, and it is whatever the group has to act on right now.
 *
 * The chat has a single line of space at the top of the screen and a week that moves
 * through it: the night poll on Monday, the squad list once there is a game, the team
 * sheet at lunchtime on the day, the questionnaire after the whistle, the result the
 * morning after. Each one takes the pin off the last.
 *
 * Nothing used to take it off. The squad list was pinned when it went up and stayed
 * there, which meant that on a Monday — with the question of which night this week
 * live in the chat and unpinned — the top of the screen still said "Football tonight
 * Wednesday", about a game five days gone. A pin that is usually wrong is worse than
 * no pin: people stop reading it, and then the one week it matters they miss it.
 *
 * Every call is best effort in both directions. Pinning and unpinning both need an
 * admin right the bot may not have been given, and neither is worth failing a cron
 * run that has already done the thing it was actually for.
 */

export interface PinChange {
  chatId: number | string;
  /** What should be pinned now. */
  messageId: number;
}

export interface PinResult {
  pinned: boolean;
  cleared: boolean;
}

/**
 * Clear the board, then pin one message.
 *
 * Clearing the whole board rather than naming what went before is deliberate, and it
 * is the only version that is reliably right. The Bot API will not tell the bot what
 * is pinned — it can add and remove, not read — so anything it does not clear
 * outright it has to clear from memory, and that memory is wrong the moment somebody
 * unpins by hand, or a cron misses a week, or the bot is added to a group that
 * already has a pin in it. The cost is that a pin somebody else put up goes too. In a
 * group where the bot is the organiser, and where the pin is how the week is
 * announced, that is the right trade.
 */
export async function focusPin(
  client: Pick<TelegramClient, "pinChatMessage" | "unpinAllChatMessages">,
  change: PinChange,
): Promise<PinResult> {
  let cleared = false;

  try {
    await client.unpinAllChatMessages(change.chatId);
    cleared = true;
  } catch {
    // No admin right, or nothing pinned. Either way the new pin still goes up: worst
    // case the group is left with two, which beats being left with only the old one.
  }

  try {
    await client.pinChatMessage(change.chatId, change.messageId);
    return { pinned: true, cleared };
  } catch {
    // Pinning needs admin rights the bot may not have. The message is still in the
    // chat and still tappable, so the run has not failed.
    return { pinned: false, cleared };
  }
}

/**
 * Whether a game already in the chat should keep the pin off Monday's night poll.
 *
 * Two questions can be live at once: an ad hoc fixture called for a Tuesday has its
 * squad list up before the week's vote goes out. "Are you playing tomorrow" wins the
 * one line at the top of the screen, because it is answerable now and expires today.
 *
 * Still to come, not merely still open. A fixture too thin for sides is never
 * cancelled, so it sits at `open` for good; a test that only asked whether a list
 * existed would hand that week the pin permanently, which is the stale pin this
 * module exists to prevent, rebuilt with an extra step.
 */
export function squadPollOutranksNightPoll(
  fixture: { rsvp_message_id: number | null; kickoff_at: string } | null,
  now: Date,
): boolean {
  if (!fixture?.rsvp_message_id) return false;
  return new Date(fixture.kickoff_at).getTime() > now.getTime();
}

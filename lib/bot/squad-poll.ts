import { breakdownFrom, toFixtureLike } from "@/lib/bot/router";
import { rsvpKeyboard, squadMessage } from "@/lib/bot/messages";
import { attachRsvpMessage } from "@/lib/repo/fixtures";
import type { FixtureRow } from "@/lib/repo/mappers";
import { listRsvps } from "@/lib/repo/rsvps";
import type { TelegramClient } from "@/lib/telegram/client";

/**
 * Put the "who's in?" list in the group and pin it.
 *
 * Two callers. Tuesday's booking posts it straight after the night is read, so the
 * group can answer from the moment there is a game rather than waiting for the day
 * before it. The daily rsvp/open cron is the fallback, and still asks the day before
 * for any fixture that got there without a list: a weekend game, a week the booking
 * never ran, a send that failed.
 *
 * Returns null, and sends nothing, when the fixture already has its list. That check
 * is what lets both callers run in the same week without the group getting two.
 */
export async function postSquadPoll(params: {
  client: TelegramClient;
  chatId: number;
  fixture: FixtureRow;
  now: Date;
}): Promise<number | null> {
  const { client, chatId, fixture, now } = params;

  if (fixture.rsvp_message_id) return null;

  const rsvps = await listRsvps(fixture.id);

  const message = await client.sendMessage({
    chat_id: chatId,
    text: squadMessage(toFixtureLike(fixture), breakdownFrom(rsvps), now),
    parse_mode: "HTML",
    reply_markup: rsvpKeyboard(fixture.id),
  });

  await attachRsvpMessage(fixture.id, chatId, message.message_id);

  // Pinned so it stays reachable as the chat moves on; silently, because the poll
  // itself is the notification.
  try {
    await client.pinChatMessage(chatId, message.message_id);
  } catch {
    // Pinning needs admin rights the bot may not have. Not worth failing the run.
  }

  return message.message_id;
}

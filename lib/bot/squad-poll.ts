import { focusPin } from "@/lib/bot/pin";
import { breakdownFrom, toFixtureLike } from "@/lib/bot/router";
import { rsvpKeyboard, squadMessage } from "@/lib/bot/messages";
import { attachRsvpMessage } from "@/lib/repo/fixtures";
import type { FixtureRow } from "@/lib/repo/mappers";
import { listRsvps } from "@/lib/repo/rsvps";
import type { TelegramClient } from "@/lib/telegram/client";

/**
 * Put the "who's in?" list in the group and pin it.
 *
 * Always at 17:00 the day before the game, from one of two callers. Monday's booking
 * posts it straight after the night is read when the game is on the Tuesday, because
 * that booking *is* the day before. The daily rsvp/open cron asks for everything
 * else: a later weeknight, a weekend game, a week the booking never ran, a send that
 * failed.
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

  // Takes the pin off the night poll. The night is settled by the time this goes up,
  // so the question the group is being asked has changed from "when" to "are you in",
  // and the pin has room for only the live one. Silent, because the list itself is
  // the notification.
  await focusPin(client, { chatId, messageId: message.message_id });

  return message.message_id;
}

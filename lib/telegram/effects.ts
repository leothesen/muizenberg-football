/**
 * Message effects — the little animation Telegram plays over a message.
 *
 * Two things about these are worth knowing before using them.
 *
 * First, `message_effect_id` is **private chats only**, which the Bot API states
 * plainly. Sending one to a group is not a no-op; it is an error, so the group's
 * match report cannot have confetti no matter how much it deserves it.
 *
 * Second, the ids themselves appear nowhere in the API reference. They are
 * client-side constants that circulate by observation, so they could be renumbered
 * or retired without any deprecation. That is why every send that uses one goes
 * through `TelegramClient.sendWithEffect`, which retries without the effect if
 * Telegram objects — a bit of confetti must never cost somebody the message.
 */

export const MESSAGE_EFFECTS = {
  fire: "5104841245755180586",
  thumbsUp: "5107584321108051014",
  thumbsDown: "5104858069142078462",
  heart: "5159385139981059251",
  party: "5046509860389126442",
  poo: "5046589136895476101",
} as const;

export type MessageEffect = keyof typeof MESSAGE_EFFECTS;

export function effectId(effect: MessageEffect): string {
  return MESSAGE_EFFECTS[effect];
}

/**
 * What to play when somebody finishes their report.
 *
 * A hat-trick gets fire, a badge gets a party, and an ordinary night gets a thumbs
 * up — the point is that it is not always the same, so it stays worth noticing.
 */
export function effectForReport(params: {
  goals: number;
  badges: number;
  ownGoals: number;
}): MessageEffect {
  if (params.goals >= 3) return "fire";
  if (params.badges > 0) return "party";
  if (params.ownGoals > 0) return "poo";
  return "thumbsUp";
}

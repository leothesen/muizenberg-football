import { MAX_DISPLAY_NAME } from "@/domain/identity";
import { encodeCallback } from "@/lib/telegram/callbacks";
import type { InlineKeyboardButton } from "@/lib/telegram/types";
import { bold, playerLabel } from "./format";

/**
 * Being called what you want to be called.
 *
 * The squad sheet had two Liams on it and no way to tell them apart, because the name
 * on it was whatever each phone happened to say. Nobody could fix that: the display
 * name has been a column since the beginning and there has never been a way for a
 * player to reach it.
 *
 * Two commands rather than a form, and they work in the group as well as in a private
 * chat — the answer comes back ephemerally, so somebody renaming themselves mid-poll
 * does not push the squad sheet up the screen for fifteen other people.
 */

export interface Identity {
  displayName: string;
  emoji: string;
}

/**
 * What you are called now, and the two ways to change it.
 *
 * The same message answers a bare `/name`, a bare `/emoji` and the button on the
 * welcome, because all three are the same question. It leads with the label exactly
 * as the squad sheet will print it — seeing it is the answer, describing it is not.
 */
export function identityMessage(player: Identity): string {
  return [
    playerLabel(player),
    "",
    "That's you — on the team sheet, on your card and in the table.",
    "",
    `${bold("/name Daniel G.")} — be called something else`,
    `${bold("/emoji 🦖")} — change the picture`,
    "",
    `<i>Up to ${MAX_DISPLAY_NAME} characters, and one emoji. Only you can see this.</i>`,
  ].join("\n");
}

/** Confirms a change by showing it, which is the only thing worth checking. */
export function identityChangedMessage(player: Identity): string {
  return [
    `${player.emoji} ${bold("Done")}`,
    "",
    playerLabel(player),
    "",
    "<i>That's how you'll appear from now on. Your record came with you.</i>",
  ].join("\n");
}

/**
 * The prompt on the welcome.
 *
 * A button cannot open a text box, so it does not pretend to: tapping it shows what
 * the newcomer is currently called and what to type instead. Somebody who has just
 * joined has no idea the commands exist, and the moment they are looking at their own
 * Telegram first name on a squad sheet is the only moment that matters.
 */
export function identityButton(): InlineKeyboardButton {
  return {
    text: "✏️ Your name and emoji",
    callback_data: encodeCallback({ kind: "identity" }),
  };
}

import { sanitiseTelegramHtml } from "@/lib/telegram/render-html";
import { HutMark } from "@/components/huts";
import { HUT_ORDER } from "@/lib/og/theme";
import type { DemoMessage } from "@/lib/demo/transcript";

/**
 * A bot message, drawn the way it lands in Telegram.
 *
 * This is the one place in the app that is deliberately not in the house style. It is
 * a picture of somebody else's software, and the argument the page makes — that the
 * whole league runs inside a chat you already have — only lands if a reader recognises
 * the chat. So it borrows Telegram's shapes rather than ours: rounded bubbles with a
 * tail, an avatar beside them, the sender's name in a colour, the time bottom-right,
 * and the inline keyboard sitting under the message rather than in it.
 *
 * The earlier version had every one of those wrong in the same way. The bubble was
 * `bg-sand-100` inside a window that was also `bg-sand-100`, so the only thing telling
 * a message apart from the chat behind it was a hairline border, and it read as a
 * bordered box rather than as anything anybody has ever sent. The sender was set in
 * the site's own 10px letterspaced uppercase, which is the exact treatment that says
 * "this is a web page".
 *
 * The keyboard is drawn either way, because a message without its buttons is not the
 * message. Whether it is live depends on `onPress`: in the walkthrough a tap moves the
 * week on, which is the closest a web page gets to letting somebody try the bot. With
 * no handler they are inert text, because a dead button that looks live is worse than
 * one that plainly is not.
 */
export function ChatBubble({
  message,
  onPress,
}: {
  message: DemoMessage;
  onPress?: (label: string) => void;
}) {
  return (
    <article>
      {/*
        The avatar sits in a row with the bubble alone, not with the bubble and its
        keyboard. Wrapping all three in one `items-end` row pushed it to the bottom of
        the buttons, leaving it floating half a message away from the thing it belongs
        to. The keyboard below is padded to the same left edge instead.
      */}
      <div className="flex items-end gap-2">
        <Avatar />

        {/*
          `rounded-bl-sm` is the tail. Telegram draws a real curved one on the last
          message of a group; squaring that one corner is the cheap version and reads
          correctly at this size without a hand-authored SVG path in the markup.
        */}
        <div className="min-w-0 max-w-[26rem] flex-1 rounded-2xl rounded-bl-sm bg-chat-bubble px-3.5 py-2.5 shadow-sm">
          <div className="mb-0.5 flex items-center gap-2">
            {/*
              Bold, sentence case, coloured — Telegram gives every sender a colour and
              it is most of what makes a group chat legible at a glance.
            */}
            <span className="text-[13px] font-bold text-chat-name">The Manager</span>
            {message.direct ? (
              <span className="bg-hut-yellow px-1.5 text-[10px] font-semibold uppercase tracking-wide text-on-paint">
                just you
              </span>
            ) : null}
            {message.pinned ? (
              <span className="text-[11px] text-ink-500">📌 pinned</span>
            ) : null}
          </div>

          {message.photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={message.photo.src}
              alt={message.photo.alt}
              className="mb-2 w-full rounded-lg"
            />
          ) : null}

          <div
            className="whitespace-pre-wrap text-[15px] leading-[1.4] text-ink-900"
            // Sanitised: attributes stripped, unknown tags escaped. The text comes from
            // our own message builders, but it is rendered through the same guard the
            // emulator uses rather than trusted because of where it came from.
            dangerouslySetInnerHTML={{ __html: sanitiseTelegramHtml(message.text) }}
          />

          {/*
            The clock, bottom-right inside the bubble, which is where Telegram puts it
            and is a surprising amount of why a screenshot reads as a chat. Fixed
            rather than live for the same reason the whole week is pinned to a date in
            2026: a page whose copy changes with the clock cannot be tested.
          */}
          <p className="mt-0.5 text-right text-[11px] leading-none text-ink-400">
            {message.sentAt}
          </p>
        </div>
      </div>

      {message.keyboard ? (
        /*
          Under the bubble, not inside it — Telegram attaches an inline keyboard to
          the message as a separate block, and putting it inside the bubble was
          another small thing making this look like a web form.

          `sm:pl-10` is the avatar's width plus the gap, so the buttons line up under
          the bubble rather than under the avatar. Only from `sm`, because that is
          where the avatar itself appears.
        */
        <div className="mt-1 sm:pl-10">
          <div className="max-w-[26rem] space-y-1">
            {message.keyboard.inline_keyboard.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-1">
                {row.map((button, buttonIndex) =>
                  onPress ? (
                    <button
                      key={buttonIndex}
                      type="button"
                      onClick={() => onPress(button.text)}
                      className="flex-1 rounded-lg bg-ink-900/[0.08] px-2 py-2 text-center text-[13px] font-medium text-chat-name hover:bg-ink-900/[0.16]"
                    >
                      {button.text}
                    </button>
                  ) : (
                    <span
                      key={buttonIndex}
                      className="flex-1 rounded-lg bg-ink-900/[0.08] px-2 py-2 text-center text-[13px] font-medium text-chat-name"
                    >
                      {button.text}
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * The sender's picture.
 *
 * A hut rather than a letter in a circle: it is the one piece of this drawing that
 * gets to be ours, it is what the bot's own rendered images are banded with, and a
 * group chat without avatars does not look like a group chat.
 */
function Avatar() {
  return (
    <span
      aria-hidden
      className="mb-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chat-bubble sm:flex"
    >
      <HutMark colour={HUT_ORDER[4]!} size={16} />
    </span>
  );
}

/**
 * The centred date pill Telegram floats over the wallpaper.
 *
 * Carries the same string the walkthrough used to print as a left-aligned eyebrow. It
 * says the same thing in the place a reader of a chat already looks for it.
 */
export function DatePill({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex justify-center">
      <span className="rounded-full bg-ink-900/[0.08] px-3 py-1 text-[11px] font-medium text-ink-700">
        {children}
      </span>
    </p>
  );
}

/**
 * The chat itself: a header, and wallpaper for the messages to sit on.
 *
 * Not a drawn handset with a notch — that is a stock illustration and says nothing
 * about this league. Just the column width a phone gives you, and the two things that
 * actually make a screenshot read as Telegram: a chat header with the group's name
 * and member count, and a ground the bubbles are plainly sitting on rather than
 * dissolving into.
 */
export function ChatWindow({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl bg-chat-paper">
      <div className="flex items-center gap-3 border-b border-ink-900/10 bg-chat-bubble px-4 py-3">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-chat-paper"
        >
          <HutMark colour={HUT_ORDER[0]!} size={18} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold tracking-tight">Muiziez Footy</span>
          <span className="block text-xs text-ink-500">38 members</span>
        </span>
      </div>

      <div className="space-y-4 px-3 py-4 sm:px-4">{children}</div>
    </div>
  );
}

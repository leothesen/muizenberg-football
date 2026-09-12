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
 * Parts carry `data-tour` names — text, keyboard, photo, badge — so the tour's floating
 * notes can point at the piece they are about without this component knowing anything
 * about notes. `data-tour-edge` marks the right-hand edge a pointer should come in from:
 * the bubble for things inside it, the keyboard for the keyboard.
 *
 * The keyboard is drawn either way, because a message without its buttons is not the
 * message. Whether it is live depends on `onPress`, and a live keyboard is outlined in
 * yellow: across the whole tour, yellow outline means "this is the thing to press".
 */
export function ChatBubble({
  message,
  onPress,
  privateChat = false,
  edited = false,
}: {
  message: DemoMessage;
  /** Hands over the whole button, callback data included, so a tap can act on it. */
  onPress?: (button: { text: string; callback_data?: string }) => void;
  /**
   * Drawn inside a one-to-one chat with the bot. Telegram names nobody and shows no
   * avatar there — there is only one other person it could be — and the "just you"
   * marker a group needs is the whole window's point.
   */
  privateChat?: boolean;
  /** Telegram's "edited" beside the clock, for a message that has rewritten itself. */
  edited?: boolean;
}) {
  const badge = privateChat ? null : message.direct ? (
    <span
      data-tour="badge"
      className="bg-hut-yellow px-1.5 text-[10px] font-semibold uppercase tracking-wide text-on-paint"
    >
      just you
    </span>
  ) : message.pinned ? (
    <span data-tour="badge" className="text-[11px] text-ink-500">
      📌 pinned
    </span>
  ) : null;

  return (
    <article>
      {/*
        The avatar sits in a row with the bubble alone, not with the bubble and its
        keyboard. Wrapping all three in one `items-end` row pushed it to the bottom of
        the buttons, leaving it floating half a message away from the thing it belongs
        to. The keyboard below is padded to the same left edge instead.
      */}
      <div className="flex items-end gap-2">
        {privateChat ? null : <Avatar />}

        {/*
          `rounded-bl-sm` is the tail. Telegram draws a real curved one on the last
          message of a group; squaring that one corner is the cheap version and reads
          correctly at this size without a hand-authored SVG path in the markup.
        */}
        <div
          data-tour-edge
          className="min-w-0 max-w-[26rem] flex-1 rounded-2xl rounded-bl-sm bg-chat-bubble px-3.5 py-2.5 shadow-sm"
        >
          {privateChat ? null : (
            <div className="mb-0.5 flex items-center gap-2">
              {/*
                Bold, sentence case, coloured — Telegram gives every sender a colour and
                it is most of what makes a group chat legible at a glance.
              */}
              <span className="text-[13px] font-bold text-chat-name">The Manager</span>
              {badge}
            </div>
          )}

          {message.photo ? (
            /*
              Width and height from the picture's real size, so the browser reserves
              the box before the image arrives. Without them the chat grew by a few
              hundred pixels a moment after each picture step appeared, and scrolled
              whatever you were meant to press out from under you.
            */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              data-tour="photo"
              src={message.photo.src}
              alt={message.photo.alt}
              width={message.photo.width}
              height={message.photo.height}
              className="mb-2 h-auto w-full rounded-lg"
            />
          ) : null}

          <div
            data-tour="text"
            className="whitespace-pre-wrap text-[15px] leading-[1.4] text-ink-900"
            // Sanitised: attributes stripped, unknown tags escaped. The text comes from
            // our own message builders, but it is rendered through the same guard the
            // emulator uses rather than trusted because of where it came from.
            dangerouslySetInnerHTML={{ __html: sanitiseTelegramHtml(message.text) }}
          />

          {/*
            The clock, bottom-right inside the bubble, which is where Telegram puts it
            and is a surprising amount of why a screenshot reads as a chat.
          */}
          <p className="mt-0.5 text-right text-[11px] leading-none text-ink-400">
            {edited ? "edited " : ""}
            {message.sentAt}
          </p>
        </div>
      </div>

      {message.keyboard ? (
        /*
          Under the bubble, not inside it — Telegram attaches an inline keyboard to the
          message as a separate block.

          `sm:pl-10` is the avatar's width plus the gap, so the buttons line up under
          the bubble rather than under the avatar. Only from `sm`, because that is
          where the avatar itself appears.
        */
        <div className={privateChat ? "mt-1" : "mt-1 sm:pl-10"}>
          <div
            data-tour="keyboard"
            data-tour-edge
            data-action={onPress ? "" : undefined}
            className={`max-w-[26rem] space-y-1 ${
              onPress ? "outline outline-2 outline-offset-[3px] outline-hut-yellow" : ""
            }`}
          >
            {message.keyboard.inline_keyboard.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-1">
                {row.map((button, buttonIndex) =>
                  onPress ? (
                    <button
                      key={buttonIndex}
                      type="button"
                      onClick={() => onPress(button)}
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
 * The private answer to a tap, as Telegram actually shows it.
 *
 * The bot replies to a button press with `answerCallbackQuery`, which Telegram draws as
 * a small dark toast over the chat, seen only by the person who tapped. Dark in both
 * of Telegram's themes, so it takes `on-paint` — the one colour in this design that
 * never flips — with white lettering.
 */
export function ChatToast({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex justify-center">
      <span
        data-tour="toast"
        data-tour-edge
        className="max-w-[20rem] rounded-xl bg-on-paint/90 px-3.5 py-2 text-center text-[13px] leading-snug text-white shadow-lg"
      >
        {children}
      </span>
    </p>
  );
}

/**
 * The sender's picture.
 *
 * A hut rather than a letter in a circle: it is the one piece of this drawing that
 * gets to be ours, and a group chat without avatars does not look like a group chat.
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
 * `fill` is the tour's version. The window takes the height it is given and the
 * messages scroll inside it, the way a chat on a phone does, so the whole window —
 * header to keyboard — fits on one screen whatever the step. Messages sit at the bottom
 * when there is room to spare, which is where the newest one always is in Telegram.
 * `bodyRef` hands the scrolling part to the tour, which keeps it at the newest message
 * and measures what is in it.
 */
export function ChatWindow({
  children,
  fill = false,
  bodyRef,
  privateChat = false,
}: {
  children: React.ReactNode;
  fill?: boolean;
  bodyRef?: React.Ref<HTMLDivElement>;
  /**
   * The one-to-one chat with the bot rather than the group. Telegram's header says
   * who you are talking to, so it is the bot's name and "bot" rather than the group
   * and its member count — which is also the plainest way to say "nobody else sees
   * this" without writing it on the page.
   */
  privateChat?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl bg-chat-paper ${
        fill ? "flex h-full min-h-0 flex-col" : ""
      }`}
    >
      <div
        data-tour="header"
        data-tour-edge
        className="flex shrink-0 items-center gap-3 border-b border-ink-900/10 bg-chat-bubble px-4 py-3"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-chat-paper"
        >
          {/* The group's hut, or the bot's — the same one beside its messages. */}
          <HutMark colour={HUT_ORDER[privateChat ? 4 : 0]!} size={18} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold tracking-tight">
            {privateChat ? "The Manager" : "Muiziez Footy"}
          </span>
          <span className="block text-xs text-ink-500">
            {privateChat ? "bot" : "38 members"}
          </span>
        </span>
      </div>

      <div
        ref={bodyRef}
        className={
          fill
            ? "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
            : "px-3 py-4 sm:px-4"
        }
      >
        {/* `mt-auto` rather than `justify-end`: a flex column that justifies to the
            end cannot be scrolled back to its top once it overflows. */}
        <div className={fill ? "mt-auto space-y-4" : "space-y-4"}>{children}</div>
      </div>
    </div>
  );
}

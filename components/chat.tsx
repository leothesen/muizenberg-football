import { sanitiseTelegramHtml } from "@/lib/telegram/render-html";
import type { DemoMessage } from "@/lib/demo/transcript";

/**
 * A bot message, drawn the way it lands in Telegram.
 *
 * The same shape as the developer emulator's bubble, because they are showing the
 * same thing to two different people — one to check the handler, one to convince
 * somebody to install Telegram. Rounded, unlike everything else in this design: these
 * are a drawing of Telegram's own interface, and squaring them off would misrepresent
 * what a player actually sees.
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
    <article className="max-w-lg rounded-2xl border border-ink-900/10 bg-sand-100 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-ink-400">
        <span>The Manager</span>
        {message.direct ? (
          <span className="bg-hut-yellow px-1.5 py-0.5 text-on-paint">just you</span>
        ) : null}
        {message.pinned ? <span>📌 pinned</span> : null}
      </div>

      {message.photo ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={message.photo.src}
          alt={message.photo.alt}
          className="mb-3 w-full rounded-lg border border-ink-900/10"
        />
      ) : null}

      <div
        className="whitespace-pre-wrap text-sm leading-relaxed"
        // Sanitised: attributes stripped, unknown tags escaped. The text comes from
        // our own message builders, but it is rendered through the same guard the
        // emulator uses rather than trusted because of where it came from.
        dangerouslySetInnerHTML={{ __html: sanitiseTelegramHtml(message.text) }}
      />

      {message.keyboard ? (
        <div className="mt-3 space-y-1.5">
          {message.keyboard.inline_keyboard.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1.5">
              {row.map((button, buttonIndex) =>
                onPress ? (
                  <button
                    key={buttonIndex}
                    type="button"
                    onClick={() => onPress(button.text)}
                    className="flex-1 rounded-lg border border-hut-blue bg-hut-blue/15 px-2 py-1.5 text-center text-xs hover:bg-hut-blue/30"
                  >
                    {button.text}
                  </button>
                ) : (
                  <span
                    key={buttonIndex}
                    className="flex-1 rounded-lg border border-hut-blue bg-hut-blue/15 px-2 py-1.5 text-center text-xs"
                  >
                    {button.text}
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

/**
 * The phone the chat sits in.
 *
 * Not a drawn handset with a notch — that is a stock illustration and says nothing
 * about this league. Just the column width a phone gives you, on the deeper sand the
 * rest of the design uses for a block that is a thing rather than a list.
 */
export function ChatWindow({ children }: { children: React.ReactNode }) {
  return (
    <div className="sand-shelf p-5 sm:p-6">
      <div className="mb-4 flex items-baseline gap-3 border-b border-ink-900/15 pb-3">
        <span className="font-bold tracking-tight">Muiziez Footy</span>
        <span className="text-xs text-ink-500">38 members</span>
      </div>
      <div className="space-y-8">{children}</div>
    </div>
  );
}

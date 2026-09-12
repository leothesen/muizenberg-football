"use client";

import { useState } from "react";
import { ChatBubble, ChatWindow } from "@/components/chat";
import { HutMark } from "@/components/huts";
import { HUT_ORDER } from "@/lib/og/theme";
import type { DemoMessage } from "@/lib/demo/transcript";

/**
 * The week, one message at a time.
 *
 * Somebody deciding whether to install a second messenger does not read a transcript;
 * they want to know what using the thing feels like. So the bot's own buttons are
 * live: tapping "I'm in" moves the week on, exactly as it would in the chat, and the
 * private reply a tap earns shows up afterwards — that reply is the one part of this
 * bot you cannot learn by reading over somebody's shoulder.
 *
 * Nothing here talks to a server. The buttons advance a local index; the messages were
 * rendered by the real builders before this component ever saw them.
 */
export function DemoWalkthrough({ steps }: { steps: DemoMessage[] }) {
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  /** The private reply earned by the tap that got us here, if it was a tap. */
  const [reply, setReply] = useState<string | null>(null);

  const step = steps[index]!;
  const last = index === steps.length - 1;

  function go(to: number, earned: string | null) {
    setReply(earned);
    setIndex(Math.min(Math.max(to, 0), steps.length - 1));
  }

  /*
    The whole week at once, for somebody who would rather scan than click — and for
    anybody who arrived wanting the detail rather than the tour. Progressive
    disclosure should never be the only way to reach the content.
  */
  if (showAll) {
    return (
      <div>
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="text-sm text-ink-500">The whole week, end to end.</p>
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="border border-ink-900/25 px-3 py-1.5 text-sm font-medium hover:border-ink-900"
          >
            Take the tour instead
          </button>
        </div>

        <ChatWindow>
          {steps.map((message, position) => (
            <div key={position}>
              <DayLabel>{message.when}</DayLabel>
              <ChatBubble message={message} />
              <p className="mt-2 max-w-lg text-sm text-ink-500">{message.note}</p>
            </div>
          ))}
        </ChatWindow>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <Progress total={steps.length} done={index} />
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-sm font-medium text-ink-500 underline decoration-ink-300 underline-offset-4 hover:text-ink-900 hover:decoration-ink-900"
        >
          Show the whole week
        </button>
      </div>

      <ChatWindow>
        {/*
          Keyed on the index so React replaces the node rather than patching it. That
          is what makes the entrance animation run on every step instead of only the
          first, and it also resets the scroll position inside the bubble.
        */}
        <div key={index} className="demo-step">
          {reply ? (
            <div className="mb-8">
              <DayLabel>Only you saw this</DayLabel>
              <ChatBubble message={{ when: "", note: "", text: reply, direct: true }} />
            </div>
          ) : null}

          <DayLabel>{step.when}</DayLabel>
          <ChatBubble
            message={step}
            // Tapping a real button is the point: it advances the week the same way
            // pressing it in Telegram would, and collects the private reply on the way.
            onPress={last ? undefined : () => go(index + 1, step.reply ?? null)}
          />
          <p className="mt-3 max-w-lg text-sm text-ink-700">{step.note}</p>
        </div>
      </ChatWindow>

      {/*
        When the message has buttons, they are the thing to press — so the control
        down here becomes a quiet bypass rather than a filled button competing with
        them. Making the skip the most prominent thing on the step was exactly
        backwards: it is the least interesting way through.
      */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        {last ? (
          <button
            type="button"
            onClick={() => go(0, null)}
            className="border border-ink-900 px-4 py-2 text-sm font-semibold hover:bg-ink-900 hover:text-sand-50"
          >
            Start again
          </button>
        ) : step.keyboard ? (
          <>
            <p className="text-sm font-medium text-ink-700">
              Tap a button in the message to carry on.
            </p>
            <Quiet onClick={() => go(index + 1, null)}>Skip ahead</Quiet>
          </>
        ) : (
          <button
            type="button"
            onClick={() => go(index + 1, null)}
            className="bg-ink-900 px-5 py-2.5 text-sm font-semibold text-sand-50 hover:bg-ink-700"
          >
            What happens next
          </button>
        )}

        {index > 0 ? <Quiet onClick={() => go(index - 1, null)}>Back</Quiet> : null}
      </div>
    </div>
  );
}

/** A control that is available without asking to be the thing you press. */
function Quiet({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium text-ink-500 underline decoration-ink-300 underline-offset-4 hover:text-ink-900 hover:decoration-ink-900"
    >
      {children}
    </button>
  );
}

function DayLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
      {children}
    </p>
  );
}

/**
 * Where you are in the week, as the row of huts.
 *
 * A count — "3 of 6" — would do the same job and say nothing. The huts are already
 * the thing this league is named after, and there are seven of them for six steps,
 * which is close enough that nobody will ever count.
 */
function Progress({ total, done }: { total: number; done: number }) {
  return (
    <p className="flex items-center gap-2">
      <span aria-hidden className="flex items-end gap-1.5">
        {Array.from({ length: total }, (_, position) => (
          <span
            key={position}
            className={position <= done ? "opacity-100" : "opacity-25"}
          >
            <HutMark colour={HUT_ORDER[position % HUT_ORDER.length]!} size={16} />
          </span>
        ))}
      </span>
      <span className="sr-only">{`Step ${done + 1} of ${total}`}</span>
    </p>
  );
}

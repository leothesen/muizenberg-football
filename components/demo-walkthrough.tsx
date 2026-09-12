"use client";

import { useState } from "react";
import { ChatBubble, ChatWindow, DatePill } from "@/components/chat";
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
 * Everything that is commentary — whose turn it is, what to press, what the message
 * means — sits OUTSIDE the chat window. Everything inside it is Telegram: the date
 * pill, the bubbles, the keyboard. Mixing the two is what made the earlier version
 * read as a web page with some chat-coloured boxes in it.
 *
 * Nothing here talks to a server. The buttons advance a local index; the messages were
 * rendered by the real builders before this component ever saw them.
 */
export function DemoWalkthrough({ steps }: { steps: DemoMessage[] }) {
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  /**
   * The private reply earned by the tap that got us here, if it was a tap.
   *
   * Carries its own clock rather than borrowing the step it is displayed above. The
   * reply lands the moment you press the button, which is the *previous* step's time —
   * showing it stamped with the next message's time had the bot answering a tap on
   * Monday afternoon at a quarter past eight on Tuesday.
   */
  const [reply, setReply] = useState<{ text: string; sentAt: string } | null>(null);

  const step = steps[index]!;
  const last = index === steps.length - 1;

  function go(to: number, earned: { text: string; sentAt: string } | null) {
    setReply(earned);
    setIndex(Math.min(Math.max(to, 0), steps.length - 1));
  }

  /*
    The whole week at once, for somebody who would rather scan than click — and for
    anybody who arrived wanting the detail rather than the tour. Progressive
    disclosure should never be the only way to reach the content.

    One continuous chat here rather than six labelled steps, because that is what a
    week in the group actually looks like scrolled back through.
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
            <div key={position} className="space-y-4">
              <DatePill>{message.when}</DatePill>
              <ChatBubble message={message} />
            </div>
          ))}
        </ChatWindow>

        <ul className="mt-5 space-y-1.5 text-sm text-ink-500">
          {steps.map((message, position) => (
            <li key={position}>
              <span className="text-ink-700">{message.when}.</span> {message.note}
            </li>
          ))}
        </ul>
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

      {/*
        Keyed on the index so React replaces the node rather than patching it. That
        is what makes the entrance animation run on every step instead of only the
        first, and it also resets the scroll position inside the bubble.
      */}
      <div key={index} className="demo-step">
        {/*
          Whose turn it is, above the chat rather than in it. The step's `when` is not
          repeated here — it is the date pill inside the window, which is where a
          reader of a chat already looks for it.
        */}
        <StepLabel actor={step.actor} />

        <ChatWindow>
          {reply ? (
            <div className="space-y-4">
              <DatePill>Only you saw this</DatePill>
              <ChatBubble
                message={{
                  when: "",
                  note: "",
                  actor: "bot",
                  sentAt: reply.sentAt,
                  text: reply.text,
                  direct: true,
                }}
              />
            </div>
          ) : null}

          <div className="space-y-4">
            <DatePill>{step.when}</DatePill>
            <ChatBubble
              message={step}
              // Tapping a real button is the point: it advances the week the same way
              // pressing it in Telegram would, and collects the private reply on the
              // way — stamped with this step's time, since that is when it lands.
              onPress={
                last
                  ? undefined
                  : () =>
                      go(
                        index + 1,
                        step.reply ? { text: step.reply, sentAt: step.sentAt } : null,
                      )
              }
            />
          </div>
        </ChatWindow>

        <p className="mt-3 max-w-lg text-sm text-ink-700">{step.note}</p>
      </div>

      <StepHint live={Boolean(step.keyboard) && !last} />

      {/*
        Every step carries the same Next, including the ones whose message has its own
        buttons. An earlier version made it a quiet "Skip" on those steps so it would
        not compete with the bot's keyboard — which meant the way forward changed
        shape halfway through the tour, and on two of the six steps the reader had to
        work out that the only way on was inside the message.

        These sit outside the chat window, so they read as the tour's furniture rather
        than as part of the message.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="button"
          onClick={() => (last ? go(0, null) : go(index + 1, null))}
          className="bg-ink-900 px-5 py-2.5 text-sm font-semibold text-sand-50 hover:bg-ink-700"
        >
          {last ? "Start again" : "Next"}
        </button>

        {index > 0 ? <Quiet onClick={() => go(index - 1, null)}>Back</Quiet> : null}
      </div>
    </div>
  );
}

/**
 * The one line telling you what to do on this step.
 *
 * Small, and it says only the thing that is not already obvious: that the buttons
 * drawn inside the message are real and are the more interesting way through. On a
 * step whose message has no keyboard there is exactly one control on screen, so the
 * hint points at it rather than inventing something to explain.
 */
function StepHint({ live }: { live: boolean }) {
  return (
    <p className="mt-4 flex items-center gap-2 text-sm">
      <span aria-hidden className="text-ink-400">
        {live ? "↑" : "↓"}
      </span>
      <span className="bg-hut-yellow px-2 py-1 text-xs font-semibold text-on-paint">
        {live ? "Those buttons work — tap one" : "Press Next"}
      </span>
    </p>
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

/**
 * Whose move this is.
 *
 * The week alternates — you, bot, you, bot, you, bot — so walking the tour spells out
 * the only claim this page has to make: there are three taps in a week and the
 * software does the other half. The page used to assert that in prose ("nobody
 * organises anything", "there is no organiser to chase", "nobody is in charge"), four
 * separate times. Labelling each step does it once, without a sentence.
 *
 * "Nothing to do" rather than "the bot" because it is phrased from the reader's side.
 * A newcomer does not care which component sends the message; they care whether it is
 * about to ask them for something.
 */
function StepLabel({ actor }: { actor: "you" | "bot" }) {
  const yours = actor === "you";

  return (
    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
      {/*
        Paint, not a coloured word — the rule the rest of the design runs on. Yellow
        because that is already this app's "notice this": the selection highlight and
        the "just you" chip inside the bubble are both painted with it.

        Drawn in both states rather than only on your steps, so the label text keeps
        its left edge down the column and the difference reads as on/off rather than
        as two different layouts.
      */}
      <span
        aria-hidden
        className={`h-2.5 w-2.5 shrink-0 ${yours ? "bg-hut-yellow" : "bg-ink-900/15"}`}
      />
      <span className={yours ? "text-ink-900" : "text-ink-500"}>
        {yours ? "Your turn" : "Nothing to do"}
      </span>
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

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
              <StepLabel actor={message.actor} when={message.when} />
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
              {/*
                A null actor, not "bot": this bubble is not a step in the week, it is
                what the tap you just made earned you. Labelling it "nothing to do"
                would be both wrong and a shame — it is the payoff for the only part
                of this page anybody actually presses.
              */}
              <StepLabel actor={null} when="" />
              <ChatBubble
                message={{
                  when: "",
                  note: "",
                  actor: "bot",
                  text: reply,
                  direct: true,
                }}
              />
            </div>
          ) : null}

          <StepLabel actor={step.actor} when={step.when} />
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
        Every step carries the same Next, including the ones whose message has its own
        buttons. An earlier version made it a quiet "Skip" on those steps so it would
        not compete with the bot's keyboard — which meant the way forward changed
        shape halfway through the tour, and on two of the six steps the reader had to
        work out that the only way on was inside the message.

        These controls sit outside the chat window, so they read as the tour's
        furniture rather than as part of the message. The bot's buttons stay the more
        interesting way through; they are just no longer the only one.

        There used to be a sentence here reading "Tap a button in the message to carry
        on." The "Your turn" label above the bubble says that in two words, before the
        reader reaches the buttons rather than after.
      */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
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
 * Whose move this is, and when.
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
function StepLabel({ actor, when }: { actor: "you" | "bot" | null; when: string }) {
  const yours = actor === "you";

  /*
    Painted for a step, invisible for the private reply — which is not a step in the
    week but the answer to the tap that got you here. Drawing the marker in all three
    states rather than omitting it keeps every label on one left edge; the version
    that omitted it left the reply's text twelve pixels out of line with the steps
    above and below, which reads as a slip rather than as a distinction.
  */
  const marker = yours ? "bg-hut-yellow" : actor ? "bg-ink-900/15" : "bg-transparent";

  return (
    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
      {/*
        Paint, not a coloured word — the rule the rest of the design runs on. Yellow
        because that is already this app's "notice this": the selection highlight and
        the "just you" chip inside the bubble are both painted with it.
      */}
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 ${marker}`} />
      <span className={yours ? "text-ink-900" : "text-ink-500"}>
        {actor ? (yours ? "Your turn" : "Nothing to do") : "Only you saw this"}
      </span>
      {when ? <span className="font-normal text-ink-400">{when}</span> : null}
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

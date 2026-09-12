"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChatBubble, ChatToast, ChatWindow, DatePill } from "@/components/chat";
import { HutMark } from "@/components/huts";
import { HUT_ORDER } from "@/lib/og/theme";
import type { DemoHint, DemoMessage } from "@/lib/demo/transcript";

/**
 * The week, one message at a time.
 *
 * Somebody deciding whether to install a second messenger does not read a transcript;
 * they want to know what using the thing feels like. So the bot's own buttons are
 * live: tapping one moves the week on, exactly as it would in the chat, and the
 * private answer a tap earns shows up as the toast it really is.
 *
 * The tour is exactly one screen tall and the page snaps to it, so the whole chat —
 * header to keyboard — and the button to carry on are always in view together. The
 * messages scroll inside the chat window when a step is taller than the screen, the
 * way they would on a phone, rather than pushing the controls off the bottom.
 *
 * Two kinds of guidance, kept apart on purpose:
 *
 *   - A yellow outline marks the thing to press. The bot's buttons when they are live,
 *     otherwise Next. Exactly one thing on each step.
 *   - Floating notes say why each part of the message exists. They never sit on the
 *     message: on a wide screen they float in the empty space beside the chat with a
 *     line to the part they are about, and on a phone, where there is no space beside
 *     it, they stack underneath. A note on top of the chat would hide the very thing
 *     it is explaining.
 *
 * Nothing here talks to a server. The messages were rendered by the real builders
 * before this component ever saw them.
 */

/** Where the notes move out beside the chat. Matches Tailwind's `lg`. */
const WIDE = "(min-width: 1024px)";
/** Space kept between two notes that would otherwise collide. */
const GAP = 12;

export function DemoWalkthrough({ steps }: { steps: DemoMessage[] }) {
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  /** The private answer earned by the tap that got us here, if it was a tap. */
  const [reply, setReply] = useState<DemoMessage["reply"] | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<SVGSVGElement>(null);

  const step = steps[index]!;
  const last = index === steps.length - 1;
  const liveKeyboard = Boolean(step.keyboard) && !last;
  const hints: DemoHint[] = reply ? [...step.hints, reply.hint] : step.hints;

  function go(to: number, earned: DemoMessage["reply"] | null) {
    setReply(earned);
    setIndex(Math.min(Math.max(to, 0), steps.length - 1));
  }

  /*
    Placing the notes. Layout, not state: every value here is a position read off the
    page and written straight back onto an element, so it runs in a layout effect and
    touches the DOM directly — before paint, so a note never flashes in the wrong
    place, and without a re-render per scroll frame.

    Re-run on anything that moves a target: a new step, the chat scrolling, the window
    resizing, or a note changing height as it wraps.
  */
  useLayoutEffect(() => {
    if (showAll) return;
    const stage = stageRef.current;
    const body = bodyRef.current;
    const gutter = gutterRef.current;
    const svg = linesRef.current;
    if (!stage || !body || !gutter || !svg) return;

    // The newest message in view on every step, which is where a chat always opens.
    body.scrollTop = body.scrollHeight;

    const media = window.matchMedia(WIDE);

    function measure() {
      const notes = Array.from(gutter!.querySelectorAll<HTMLElement>("[data-callout]"));
      const lines = Array.from(svg!.querySelectorAll<SVGGElement>("[data-line]"));

      if (!media.matches) {
        // Stacked under the chat; the flow places them.
        for (const note of notes) {
          note.style.transform = "";
          note.removeAttribute("data-placed");
        }
        for (const line of lines) line.removeAttribute("data-shown");
        return;
      }

      const s = stage!.getBoundingClientRect();
      const b = body!.getBoundingClientRect();
      const g = gutter!.getBoundingClientRect();

      const items = notes.map((note, position) => {
        const target = body!.querySelector<HTMLElement>(
          `[data-tour="${note.dataset.target}"]`,
        );
        if (!target) return { note, line: lines[position], shown: false as const };

        const t = target.getBoundingClientRect();
        // Only the part of the target that is actually on screen inside the chat. A
        // note pointing at something scrolled out of view points at nothing.
        const top = Math.max(t.top, b.top);
        const bottom = Math.min(t.bottom, b.bottom);
        if (bottom - top < 12) return { note, line: lines[position], shown: false as const };

        const edge = (target.closest<HTMLElement>("[data-tour-edge]") ?? target).getBoundingClientRect();
        const height = note.offsetHeight;
        const anchorY = (top + bottom) / 2;

        return {
          note,
          line: lines[position],
          shown: true as const,
          height,
          anchorX: edge.right - s.left + 10,
          anchorY: anchorY - s.top,
          want: anchorY - g.top - height / 2,
          at: 0,
        };
      });

      // Level with the target where possible, then pushed apart so no two overlap,
      // then pulled back inside the column.
      const shown = items.filter((item) => item.shown).sort((x, y) => x.want - y.want);
      let cursor = 0;
      for (const item of shown) {
        item.at = Math.max(item.want, cursor);
        cursor = item.at + item.height + GAP;
      }
      let limit = g.height;
      for (let k = shown.length - 1; k >= 0; k -= 1) {
        const item = shown[k]!;
        item.at = Math.max(0, Math.min(item.at, limit - item.height));
        limit = item.at - GAP;
      }

      const gutterX = g.left - s.left;
      const gutterY = g.top - s.top;

      for (const item of items) {
        if (!item.shown) {
          item.note.style.transform = "";
          item.note.removeAttribute("data-placed");
          item.line?.removeAttribute("data-shown");
          continue;
        }

        item.note.style.transform = `translateY(${Math.round(item.at)}px)`;
        item.note.setAttribute("data-placed", "");

        const line = item.line;
        if (!line) continue;
        const path = line.querySelector("path");
        const dot = line.querySelector("circle");
        const endX = gutterX - 6;
        const endY = gutterY + item.at + Math.min(item.height / 2, 18);
        const bend = (item.anchorX + endX) / 2;
        path?.setAttribute(
          "d",
          `M ${item.anchorX} ${item.anchorY} C ${bend} ${item.anchorY}, ${bend} ${endY}, ${endX} ${endY}`,
        );
        dot?.setAttribute("cx", String(item.anchorX));
        dot?.setAttribute("cy", String(item.anchorY));
        line.setAttribute("data-shown", "");
      }
    }

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();

    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    for (const note of gutter.querySelectorAll("[data-callout]")) observer.observe(note);
    body.addEventListener("scroll", schedule, { passive: true });
    media.addEventListener("change", schedule);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      body.removeEventListener("scroll", schedule);
      media.removeEventListener("change", schedule);
    };
  }, [index, reply, showAll]);

  /*
    The whole week at once, for somebody who would rather scan than click. Progressive
    disclosure should never be the only way to reach the content. Not snapped: it is a
    long read, and a page that grabs the scroll of a long read is fighting its reader.
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

        <div className="max-w-xl">
          <ChatWindow>
            {steps.map((message, position) => (
              <div key={position} className="space-y-4">
                <DatePill>{message.when}</DatePill>
                <ChatBubble message={message} />
              </div>
            ))}
          </ChatWindow>
        </div>

        <dl className="mt-8 grid max-w-3xl gap-x-10 gap-y-6 sm:grid-cols-2">
          {steps.map((message, position) => (
            <div key={position}>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                {message.when}
              </dt>
              {message.hints.map((hint) => (
                <dd key={hint.title} className="mt-1.5 text-sm text-ink-700">
                  <span className="font-semibold text-ink-900">{hint.title}.</span>{" "}
                  {hint.body}
                </dd>
              ))}
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="tour-snap flex h-[100svh] min-h-[36rem] snap-start flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-5">
          <Progress total={steps.length} done={index} />
          <StepLabel actor={step.actor} />
        </div>
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-sm font-medium text-ink-500 underline decoration-ink-300 underline-offset-4 hover:text-ink-900 hover:decoration-ink-900"
        >
          Show the whole week
        </button>
      </div>

      {/*
        One row on a wide screen — chat, then the empty column the notes float in — and
        a column on a phone, with the notes stacked under the chat. The chat takes all
        the height left over in both.
      */}
      <div
        ref={stageRef}
        className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-x-16"
      >
        <ChatWindow fill bodyRef={bodyRef}>
          {/*
            Keyed on the step so React replaces the node rather than patching it. That
            is what replays the entrance animation on every step.
          */}
          <div key={index} className="demo-step space-y-4">
            {reply ? <ChatToast>{reply.text}</ChatToast> : null}
            <DatePill>{step.when}</DatePill>
            <ChatBubble
              message={step}
              // Tapping a real button is the point: it advances the week the same way
              // pressing it in Telegram would, and earns the private answer on the way.
              onPress={liveKeyboard ? () => go(index + 1, step.reply ?? null) : undefined}
            />
          </div>
        </ChatWindow>

        <div ref={gutterRef} className="flex flex-col gap-2 lg:relative lg:block">
          {hints.map((hint, position) => (
            <Callout
              key={`${index}-${reply ? "r" : ""}-${hint.target}-${position}`}
              hint={hint}
              action={liveKeyboard && hint.target === "keyboard"}
            />
          ))}
        </div>

        {/* The pointers. Drawn over the whole stage and ignoring the mouse, so a line
            crossing the chat's edge never gets in the way of a tap. */}
        <svg
          ref={linesRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible lg:block"
        >
          {hints.map((hint, position) => {
            const action = liveKeyboard && hint.target === "keyboard";
            return (
              <g key={`${index}-${reply ? "r" : ""}-${hint.target}-${position}`} data-line>
                <path
                  fill="none"
                  strokeWidth={1.5}
                  className={action ? "stroke-hut-yellow" : "stroke-ink-400"}
                />
                <circle r={4} className={action ? "fill-hut-yellow" : "fill-ink-400"} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/*
          Every step carries the same Next, in the same place, including the steps whose
          message has its own buttons — the way forward never changes shape. It takes
          the yellow outline whenever it is the thing to press.
        */}
        <button
          type="button"
          onClick={() => (last ? go(0, null) : go(index + 1, null))}
          data-action={liveKeyboard ? undefined : ""}
          className={`bg-ink-900 px-5 py-2.5 text-sm font-semibold text-sand-50 hover:bg-ink-700 ${
            liveKeyboard ? "" : "outline outline-2 outline-offset-[3px] outline-hut-yellow"
          }`}
        >
          {last ? "Start again" : "Next"}
        </button>

        {index > 0 ? <Quiet onClick={() => go(index - 1, null)}>Back</Quiet> : null}
      </div>
    </div>
  );
}

/**
 * One floating note.
 *
 * Square, like everything else on the site that is ours rather than Telegram's. The
 * note about the thing to press is painted the same yellow as its outline, so the two
 * read as one instruction; notes that only explain are plain.
 *
 * On a phone the title runs into the sentence to save a line, because every line these
 * take is a line the chat above them loses.
 */
function Callout({ hint, action }: { hint: DemoHint; action: boolean }) {
  return (
    <div
      data-callout
      data-target={hint.target}
      role="note"
      aria-label={hint.title}
      className={`tour-callout px-3 py-2 text-[13px] leading-snug shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] lg:absolute lg:inset-x-0 lg:top-0 lg:max-w-[17rem] lg:py-2.5 ${
        action ? "bg-hut-yellow text-on-paint" : "border border-ink-900/10 bg-sand-100 text-ink-700"
      }`}
    >
      <p>
        <span className={`font-bold lg:block ${action ? "" : "text-ink-900"}`}>
          {hint.title}
          <span className="lg:hidden">.</span>
        </span>{" "}
        <span className="lg:mt-0.5 lg:block">{hint.body}</span>
      </p>
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
 * Whose move this is.
 *
 * The week alternates — you, bot, you, bot, you, bot — so walking the tour spells out
 * the only claim this page has to make: there are three taps in a week and the
 * software does the other half.
 *
 * "Nothing to do" rather than "the bot" because it is phrased from the reader's side.
 */
function StepLabel({ actor }: { actor: "you" | "bot" }) {
  const yours = actor === "you";

  return (
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
      {/*
        Paint, not a coloured word — the rule the rest of the design runs on. Drawn in
        both states so the text keeps its left edge and the difference reads as on/off.
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
 * the thing this league is named after.
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

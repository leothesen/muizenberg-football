"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SCENARIOS, scenarioById } from "@/lib/demo/scenarios";
import { visibleTo, type RenderedAlert, type RenderedMessage } from "@/lib/telegram/emulator-fold";
import { sanitiseTelegramHtml } from "@/lib/telegram/render-html";
import { cn } from "@/lib/utils";

interface EmulatorPlayer {
  id: string;
  telegramUserId: number;
  displayName: string;
  emoji: string;
  privateChatId: number | null;
}

interface Props {
  chatId: number;
  players: EmulatorPlayer[];
  messages: RenderedMessage[];
  alerts: RenderedAlert[];
}

/**
 * A demo you can watch.
 *
 * Almost nothing this bot does is triggered by a person tapping something. The poll
 * arrives on a Monday, the nudge on the morning of the game, the report the next day —
 * so the old version of this page, a row of buttons named after cron routes, could
 * show what the bot *can* do while never showing what it *is*. You had to already
 * understand the product to operate it.
 *
 * A scenario is the same machinery in an order that tells a story, narrated as it
 * goes. Every message on the right was produced by the real handler a live Telegram
 * update would have reached; the only thing scripted is the order and the commentary.
 */

const PACES = [
  { label: "Slow", ms: 3200 },
  { label: "Normal", ms: 1800 },
  { label: "Fast", ms: 700 },
] as const;

export function Emulator({ chatId, players, messages, alerts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]!.id);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paceIndex, setPaceIndex] = useState(1);

  // Derived rather than stored: a viewer who leaves the group would otherwise linger
  // as a selected id pointing at nobody.
  const [chosenViewer, setChosenViewer] = useState<number | null>(null);
  const viewerId = players.some((p) => p.telegramUserId === chosenViewer)
    ? chosenViewer
    : (players[0]?.telegramUserId ?? null);
  const viewer = players.find((p) => p.telegramUserId === viewerId) ?? null;

  const scenario = scenarioById(scenarioId) ?? SCENARIOS[0]!;
  const steps = scenario.steps;
  const finished = cursor >= steps.length;
  const running = playing && !finished;

  const feedRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLOListElement>(null);

  // Scoped to one person's view, DMs included: a demo that shows everybody's private
  // questionnaire while claiming to read the chat as Zanele is showing the opposite of
  // the decision it is trying to explain.
  const visible = visibleTo(messages, viewerId, {
    groupChatId: chatId,
    viewerPrivateChatId: viewer?.privateChatId ?? null,
  });

  async function runStep(index: number) {
    const action = steps[index]?.action;

    // The one action the page performs itself. Several decisions in this product are
    // about who sees what — an ephemeral welcome, a private nudge, a DM full of
    // questions — and none of that is visible while you read the chat as one person
    // throughout. There is nothing for the server to do.
    if (action?.kind === "viewAs") {
      setChosenViewer(action.user);
      setCursor(index + 1);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/dev/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: scenario.id, step: index }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };

      if (!result.ok) {
        // Stop rather than ploughing on: every later step assumes this one worked, so
        // continuing would produce a cascade of confusing failures instead of one
        // clear message beside the step that broke.
        setError(result.error ?? "That step failed.");
        setPlaying(false);
        return;
      }

      setCursor(index + 1);
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPlaying(false);
    } finally {
      setBusy(false);
    }
  }

  // Autoplay. Waits for the refresh as well as the request, so the pace is the time
  // between messages appearing rather than between requests being sent.
  //
  // `running` is derived rather than a second piece of state: stopping at the end by
  // calling setPlaying(false) from inside the effect is a cascading render, and one
  // flag that can disagree with the cursor is one flag too many.
  useEffect(() => {
    if (!running || busy || pending) return;

    const timer = setTimeout(() => void runStep(cursor), PACES[paceIndex]!.ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, busy, pending, cursor, paceIndex]);

  // Both panes follow along: the chat to the newest message, the script to the step
  // producing it. Without this the interesting half of the screen scrolls out of view
  // about four steps in.
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;

    // Assigned rather than animated. A smooth scroll is cancelled by the next
    // router.refresh() landing mid-animation, which during autoplay is every time —
    // the chat ends up parked wherever the last interrupted glide left it.
    feed.scrollTop = feed.scrollHeight;
  }, [messages]);

  useEffect(() => {
    scriptRef.current
      ?.querySelector('[data-current="true"]')
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  function chooseScenario(id: string) {
    setScenarioId(id);
    setCursor(0);
    setPlaying(false);
    setError(null);
  }

  async function restart() {
    setPlaying(false);
    setCursor(0);
    setError(null);
    // Step 0 of every scenario is the reset, so running it clears the chat.
    await runStep(0);
    setCursor(1);
  }

  async function press(data: string) {
    setBusy(true);
    await fetch("/api/dev/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "callback", telegramUserId: viewerId, data }),
    });
    startTransition(() => router.refresh());
    setBusy(false);
  }

  return (
    <main className="mx-auto grid h-dvh max-w-7xl gap-5 overflow-hidden p-5 lg:grid-cols-[26rem_1fr]">
      <section className="flex min-h-0 flex-col gap-4">
        <header>
          <h1 className="text-lg font-semibold text-ink-900">Watch a week happen</h1>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Every message is produced by the real handler. Only the order and the
            commentary are scripted.
          </p>
        </header>

        <div className="flex flex-wrap gap-1.5">
          {SCENARIOS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => chooseScenario(option.id)}
              className={cn(
                "border px-3 py-1 text-xs transition",
                option.id === scenario.id
                  ? "border-ink-900 bg-hut-yellow text-ink-900"
                  : "border-ink-900/20 text-ink-500 hover:border-ink-400",
              )}
            >
              {option.title}
            </button>
          ))}
        </div>

        <p className="text-xs italic leading-relaxed text-ink-400">{scenario.blurb}</p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((on) => !on)}
            disabled={finished}
            className={cn(
              "border px-3 py-2 text-xs font-medium transition",
              finished
                ? "border-ink-900/10 text-sand-300"
                : running
                  ? "border-ink-900 bg-hut-yellow text-ink-900"
                  : "border-ink-900 bg-hut-green text-ink-900 hover:bg-hut-green/80",
            )}
          >
            {running ? "⏸ Pause" : "▶ Play"}
          </button>

          <button
            type="button"
            onClick={() => void runStep(cursor)}
            disabled={busy || finished}
            className="border border-ink-900/20 px-3 py-2 text-xs text-ink-700 transition hover:border-ink-400 disabled:text-sand-300"
          >
            ⏭ Step
          </button>

          <button
            type="button"
            onClick={() => void restart()}
            disabled={busy}
            className="border border-ink-900/20 px-3 py-2 text-xs text-ink-700 transition hover:border-ink-400 disabled:text-sand-300"
          >
            ↺ Restart
          </button>

          <div className="ml-auto flex overflow-hidden border border-ink-900/20">
            {PACES.map((pace, index) => (
              <button
                key={pace.label}
                type="button"
                onClick={() => setPaceIndex(index)}
                className={cn(
                  "px-2 py-2 text-[11px] transition",
                  index === paceIndex
                    ? "bg-ink-900/10 text-ink-900"
                    : "text-ink-400 hover:text-ink-700",
                )}
              >
                {pace.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-hut-red bg-hut-red/15 px-3 py-2 text-xs text-ink-900">
            {error}
          </p>
        )}

        <ol ref={scriptRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {steps.map((step, index) => {
            const done = index < cursor;
            const current = index === cursor;

            return (
              <li
                key={`${scenario.id}-${index}`}
                data-current={current}
                className={cn(
                  "rounded-lg border px-3 py-2 transition",
                  current
                    ? "border-hut-yellow bg-hut-yellow/20"
                    : done
                      ? "border-transparent opacity-45"
                      : "border-transparent opacity-70",
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-ink-400">
                    {done ? "✓" : current ? "▸" : "·"}
                  </span>
                  <div className="min-w-0">
                    {step.when && (
                      <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400">
                        {step.when}
                      </p>
                    )}
                    <p className="text-[13px] leading-snug text-ink-900/85">{step.narration}</p>
                    {step.note && (current || done) && (
                      <p className="mt-1.5 border-l-2 border-hut-blue pl-2 text-[11px] leading-relaxed text-ink-500">
                        {step.note}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-2 border-t border-ink-900/10 pt-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-400">
            Viewing as
          </span>
          <select
            id="viewer"
            value={viewerId ?? ""}
            onChange={(event) => setChosenViewer(Number(event.target.value))}
            className="flex-1 rounded-lg border border-ink-900/20 bg-sand-100 px-2 py-1.5 text-xs text-ink-900"
          >
            {players.map((player) => (
              <option key={player.id} value={player.telegramUserId}>
                {player.emoji} {player.displayName}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-2xl border border-ink-900/10 bg-sand-100">
        <header className="flex items-center gap-2 border-b border-ink-900/10 px-4 py-3">
          <span className="text-sm font-medium text-ink-900">Muiziez Footy</span>
          <span className="text-[10px] font-mono text-ink-400">{chatId}</span>
          {viewer && (
            <span className="ml-auto text-[11px] text-ink-400">
              {viewer.emoji} {viewer.displayName} is reading
            </span>
          )}
        </header>

        <div ref={feedRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {visible.length === 0 && (
            <p className="py-16 text-center text-sm text-ink-400">
              Nothing yet. Press play.
            </p>
          )}

          {visible.map((message) => (
            <MessageBubble key={message.id} message={message} onPress={(d) => void press(d)} />
          ))}

          {/*
            Only the last few. A callback answer is a toast that appears over the chat
            for a second and vanishes — rendering every one as a permanent entry meant
            that a step where ten people tap a button buried the actual messages under
            ten identical confirmations, which is the opposite of what the demo is for.
          */}
          {alerts.slice(-3).map((alert) => (
            <p
              key={alert.id}
              className="mx-auto max-w-sm rounded-full border border-ink-900/10 bg-sand-50/60 px-3 py-1.5 text-center text-[11px] text-ink-500"
            >
              {alert.text}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}

function isDataImage(note: string | null | undefined): note is string {
  return typeof note === "string" && note.startsWith("data:image/");
}

function MessageBubble({
  message,
  onPress,
}: {
  message: RenderedMessage;
  onPress: (data: string) => void;
}) {
  return (
    <article
      className={cn(
        "max-w-xl rounded-2xl border px-4 py-3",
        message.ephemeralFor !== null
          ? "border-hut-yellow bg-hut-yellow/15"
          : "border-ink-900/10 bg-sand-100",
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-ink-400">
        <span>Bot</span>
        {message.ephemeralFor !== null && (
          <span className="rounded bg-hut-yellow px-1.5 py-0.5 text-ink-900">
            only you
          </span>
        )}
        {message.editedAt && <span className="text-ink-500">edited</span>}
        {message.pinned && <span>📌 pinned</span>}
        {message.reaction && <span>{message.reaction}</span>}
      </div>

      {message.kind === "photo" &&
        (isDataImage(message.photoNote) ? (
          /* A data: URL in a dev-only page — next/image would try to optimise
             something that never leaves this laptop. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.photoNote}
            alt="What the bot sent"
            className="mb-2 w-full rounded-lg border border-ink-900/10"
          />
        ) : (
          <p className="mb-2 rounded-lg border border-dashed border-ink-900/25 px-3 py-6 text-center text-xs text-ink-400">
            🖼️ image {message.photoNote}
          </p>
        ))}

      <div
        className="whitespace-pre-wrap text-sm leading-relaxed"
        // Sanitised above: attributes stripped, unknown tags escaped.
        dangerouslySetInnerHTML={{ __html: sanitiseTelegramHtml(message.text) }}
      />

      {message.keyboard.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {message.keyboard.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1.5">
              {row.map((button, buttonIndex) => (
                <button
                  key={buttonIndex}
                  type="button"
                  disabled={!button.callback_data}
                  onClick={() => button.callback_data && onPress(button.callback_data)}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1.5 text-xs transition",
                    button.callback_data
                      ? "border-hut-blue bg-hut-blue/15 text-ink-900 hover:bg-hut-blue/30"
                      : "border-ink-900/10 text-ink-400",
                  )}
                  title={button.url ?? button.web_app?.url ?? button.callback_data}
                >
                  {button.text}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GROUP_COMMANDS } from "@/lib/bot/registration";
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
 * A fake Telegram group, driven by the real bot.
 *
 * Every button here posts a genuine Update shape into the same handler the webhook
 * uses, so what appears is the bot's actual behaviour. The point of it is the two
 * things you cannot otherwise see without a real group and a real token: a message
 * that rewrites itself in place, and a message only one member can see.
 */
export function Emulator({ chatId, players, messages, alerts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [viewer, setViewer] = useState<EmulatorPlayer | null>(players[0] ?? null);
  const [draft, setDraft] = useState("/next");
  const [error, setError] = useState<string | null>(null);

  // A DM addressed to somebody else is as invisible as an ephemeral message, so
  // the emulator filters by chat as well as by recipient.
  const inMyChats = messages.filter(
    (m) => m.chatId === chatId || (viewer?.privateChatId != null && m.chatId === viewer.privateChatId),
  );
  const visible = visibleTo(inMyChats, viewer?.telegramUserId ?? null);
  const hiddenCount = messages.length - visible.length;

  async function simulate(body: Record<string, unknown>) {
    setError(null);
    const response = await fetch("/api/dev/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        telegramUserId: viewer?.telegramUserId,
        firstName: viewer?.displayName,
        chatId,
        ...body,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? `Request failed (${response.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function clearChat() {
    await fetch("/api/dev/simulate", { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl gap-6 p-6 lg:grid-cols-[22rem_1fr]">
      <aside className="space-y-6">
        <header>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-hut-yellow">
            Development only
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Telegram emulator</h1>
          <p className="mt-2 text-sm text-chalk/60">
            Drives the real bot with no token and no group. Switch player to see what each
            person actually sees.
          </p>
        </header>

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-chalk/50">
            You are
          </h2>
          <div className="flex flex-wrap gap-2">
            {players.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => setViewer(player)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition",
                  viewer?.id === player.id
                    ? "border-hut-yellow bg-hut-yellow/15 text-hut-yellow"
                    : "border-chalk/15 text-chalk/70 hover:border-chalk/40",
                )}
              >
                {player.emoji} {player.displayName}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-chalk/50">Actions</h2>
          <button
            type="button"
            onClick={() => simulate({ action: "join", telegramUserId: 900900, firstName: "Newcomer" })}
            className="w-full rounded-lg border border-hut-green/40 bg-hut-green/10 px-3 py-2 text-left text-sm text-hut-green hover:bg-hut-green/20"
          >
            👋 A stranger joins the group
          </button>
          <button
            type="button"
            onClick={() => simulate({ action: "join" })}
            className="w-full rounded-lg border border-chalk/15 px-3 py-2 text-left text-sm hover:border-chalk/40"
          >
            🔁 Rejoin as {viewer?.displayName ?? "nobody"}
          </button>
          <button
            type="button"
            onClick={clearChat}
            className="w-full rounded-lg border border-hut-red/40 px-3 py-2 text-left text-sm text-hut-red hover:bg-hut-red/10"
          >
            🧹 Clear the chat
          </button>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-chalk/50">
            Commands
          </h2>

          {/*
            Straight from GROUP_COMMANDS, which is what registration actually sends to
            Telegram — so this list cannot drift from the menu a real player sees, and
            a command added to the bot shows up here without anyone remembering.
          */}
          <div className="space-y-1.5">
            {GROUP_COMMANDS.map((command) => (
              <button
                key={command.command}
                type="button"
                onClick={() => simulate({ action: "message", text: `/${command.command}` })}
                className="flex w-full items-baseline gap-3 rounded-lg border border-chalk/15 px-3 py-2 text-left transition hover:border-hut-blue hover:bg-hut-blue/10"
              >
                <span className="font-mono text-sm text-hut-blue">/{command.command}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-chalk/50">
                  {command.description}
                </span>
              </button>
            ))}
          </div>

          <h2 className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest text-chalk/50">
            Or type anything
          </h2>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) simulate({ action: "message", text: draft.trim() });
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-chalk/15 bg-pitch-800 px-3 py-2 font-mono text-sm outline-none focus:border-hut-blue"
              placeholder="/next"
            />
            <button
              type="submit"
              className="rounded-lg bg-hut-blue px-3 py-2 text-sm font-semibold text-pitch-900"
            >
              Send
            </button>
          </form>
        </section>

        {error && (
          <p className="rounded-lg border border-hut-red/40 bg-hut-red/10 p-3 text-sm text-hut-red">
            {error}
          </p>
        )}
      </aside>

      <section className="flex min-h-[60vh] flex-col rounded-card border border-chalk/10 bg-pitch-800/70">
        <header className="flex items-center justify-between border-b border-chalk/10 px-5 py-3">
          <div>
            <p className="font-semibold">Muizenberg Football ⚽</p>
            <p className="font-mono text-xs text-chalk/40">chat {chatId}</p>
          </div>
          {pending && <span className="text-xs text-chalk/40">refreshing…</span>}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {visible.length === 0 && (
            <p className="py-16 text-center text-sm text-chalk/40">
              Nothing here yet. Try a command, or have a stranger join.
            </p>
          )}

          {visible.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onPress={(data) =>
                simulate({
                  action: "callback",
                  callbackData: data,
                  messageId: message.id,
                  // A DM button must answer in the DM, not in the group.
                  chatId: message.chatId ?? chatId,
                })
              }
            />
          ))}

          {hiddenCount > 0 && (
            <p className="pt-2 text-center font-mono text-xs text-chalk/30">
              {hiddenCount} message{hiddenCount === 1 ? "" : "s"} hidden — addressed to
              somebody else
            </p>
          )}
        </div>

        {alerts.length > 0 && (
          <footer className="border-t border-chalk/10 px-5 py-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-chalk/40">
              Last popup
            </p>
            <p
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                alerts.at(-1)!.modal
                  ? "border border-hut-yellow/40 bg-hut-yellow/10 text-hut-yellow"
                  : "bg-pitch-700 text-chalk/70",
              )}
            >
              {alerts.at(-1)!.text}
            </p>
          </footer>
        )}
      </section>
    </main>
  );
}

/**
 * Only ever a data: URL the emulator transport wrote itself. Checked rather than
 * assumed, because the same field also carries a "too big to preview" note.
 */
function isDataImage(value: string | undefined): value is string {
  return value !== undefined && value.startsWith("data:image/");
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
          ? "border-hut-yellow/30 bg-hut-yellow/5"
          : "border-chalk/10 bg-pitch-700",
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-chalk/40">
        <span>Bot</span>
        {message.ephemeralFor !== null && (
          <span className="rounded bg-hut-yellow/20 px-1.5 py-0.5 text-hut-yellow">
            only you
          </span>
        )}
        {message.editedAt && <span className="text-hut-blue">edited</span>}
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
            className="mb-2 w-full rounded-lg border border-chalk/10"
          />
        ) : (
          <p className="mb-2 rounded-lg border border-dashed border-chalk/20 px-3 py-6 text-center text-xs text-chalk/40">
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
                      ? "border-hut-blue/40 bg-hut-blue/10 text-hut-blue hover:bg-hut-blue/20"
                      : "border-chalk/10 text-chalk/40",
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

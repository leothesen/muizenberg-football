"use client";

import { useEffect, useState } from "react";
import type { PlayerCardContext } from "@/lib/bot/results";
import { Hut } from "@/components/huts";
import { hutFor } from "@/lib/og/theme";

/**
 * The Mini App.
 *
 * There is no login screen and there is no login button. Telegram hands the page a
 * signed `initData` on load; the page posts it once, the server checks the signature
 * and answers with a session. From the player's point of view they tapped a menu
 * button and were already in.
 *
 * The three states below are all real and all reachable: signing in, signed in, and
 * "you opened this outside Telegram", which is the desktop-browser case and is where
 * the OAuth login lives.
 */

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand?: () => void;
  colorScheme?: string;
  themeParams?: Record<string, string>;
  MainButton?: { hide: () => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/**
 * How long to wait for `telegram-web-app.js` before deciding we are in an ordinary
 * browser. Inside Telegram the object appears almost immediately; outside, this is
 * the only cost of finding out, and the alternative — blocking on the script — leaves
 * the page stuck forever whenever telegram.org is slow or blocked.
 */
const TELEGRAM_WAIT_MS = 1500;
const POLL_MS = 50;

async function waitForTelegram(): Promise<TelegramWebApp | undefined> {
  const deadline = Date.now() + TELEGRAM_WAIT_MS;

  for (;;) {
    const webApp = window.Telegram?.WebApp;
    if (webApp) return webApp;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

type State =
  | { status: "starting" }
  | { status: "outside" }
  | { status: "failed"; reason: string }
  | { status: "in"; card: PlayerCardContext; playerId: string };

export function MiniApp() {
  const [state, setState] = useState<State>({ status: "starting" });

  useEffect(() => {
    // A Mini App can be closed mid-request, and updating state afterwards is a
    // warning in development and a leak in principle.
    let cancelled = false;
    const apply = (next: State) => {
      if (!cancelled) setState(next);
    };

    async function loadSession(): Promise<State | null> {
      const me = await fetch("/api/auth/me");
      if (!me.ok) return null;

      const body = (await me.json()) as { card: PlayerCardContext; player: { id: string } };
      return { status: "in", card: body.card, playerId: body.player.id };
    }

    async function bootstrap() {
      const webApp = await waitForTelegram();
      webApp?.ready();
      webApp?.expand?.();

      const initData = webApp?.initData;

      // Opened in an ordinary browser: there is no initData to check, so fall back to
      // any existing session and then to the desktop login, rather than pretending
      // something went wrong.
      if (!initData) {
        apply((await loadSession()) ?? { status: "outside" });
        return;
      }

      const response = await fetch("/api/auth/miniapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        apply({ status: "failed", reason: body.error ?? String(response.status) });
        return;
      }

      apply((await loadSession()) ?? { status: "failed", reason: "session did not stick" });
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "starting") {
    return <Shell>Checking who you are…</Shell>;
  }

  if (state.status === "outside") {
    return (
      <Shell>
        <p className="mb-6 text-ink-700">
          This page lives inside Telegram. Open it from the bot&rsquo;s menu button, or sign
          in here.
        </p>
        <a
          className="inline-block bg-ink-900 px-5 py-2.5 font-semibold text-sand-50"
          href="/api/auth/login/start"
        >
          Log in with Telegram
        </a>
      </Shell>
    );
  }

  if (state.status === "failed") {
    return (
      <Shell>
        <p className="border-l-2 border-hut-red bg-sand-100 px-4 py-3 text-ink-900">Could not sign you in ({state.reason}).</p>
        <p className="mt-3 text-sm text-ink-500">
          Close this and reopen it from the bot, and it will usually sort itself out.
        </p>
      </Shell>
    );
  }

  return <Card card={state.card} playerId={state.playerId} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">The league</h1>
      {children}
    </main>
  );
}

const ATTRIBUTES: [keyof PlayerCardContext["attributes"], string][] = [
  ["finishing", "Finishing"],
  ["vision", "Vision"],
  ["flair", "Flair"],
  ["defending", "Defending"],
  ["keeping", "Keeping"],
  ["reputation", "Reputation"],
];

function Card({ card, playerId }: { card: PlayerCardContext; playerId: string }) {
  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Hut seed={card.displayName} size={28} />
        <span className="text-5xl">{card.emoji}</span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{card.displayName}</h1>
          <p className="text-sm text-ink-500">
            {card.rating.toFixed(1)} · {card.appearances === 1 ? "1 game" : `${card.appearances} games`}
          </p>
        </div>
      </div>

      {/* The rendered card, exactly the one the bot posts into the chat. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="mb-8 w-full border"
        style={{ borderColor: hutFor(card.displayName) }}
        src={`/api/og/card/${playerId}`}
        alt={`${card.displayName}'s player card`}
      />

      <dl className="mb-8 grid grid-cols-2 gap-x-8 text-sm">
        {ATTRIBUTES.map(([key, label]) => (
          <div key={key} className="flex justify-between border-b border-ink-900/10 py-2">
            <dt className="text-sm text-ink-500">{label}</dt>
            <dd>{card.attributes[key]}</dd>
          </div>
        ))}
      </dl>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="w-full border border-ink-900/15"
        src="/api/og/leaderboard"
        alt="The season table"
      />
    </main>
  );
}

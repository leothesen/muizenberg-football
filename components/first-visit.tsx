"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

/**
 * A word to somebody who has never been here before.
 *
 * The front page is a league table, and a league table assumes you already know what
 * the league is. In week one it is worse than that — the season has not started, so
 * the page is three empty states and two buttons. Somebody who followed a link from
 * outside the group needs one sentence and a way in, and the members who make up
 * almost all of the traffic need never to see it again.
 *
 * Hence: once per browser, and dismissed for good the moment it is closed or
 * followed. It is deliberately not a modal. A dialog that blocks a page somebody
 * landed on to check a kickoff time is a worse first impression than no greeting.
 */

const STORAGE_KEY = "seen-intro";

/** Fired on this tab, since `storage` only reaches the *other* ones. */
const SEEN_EVENT = "introseen";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SEEN_EVENT, onChange);
  };
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private windows and blocked site data both throw. Treat that as "seen": a
    // greeting that cannot remember being dismissed would return on every page load,
    // which is the one behaviour worse than never showing it.
    return true;
  }
}

/**
 * The server cannot know, and guessing wrong is not symmetric.
 *
 * Rendering "unseen" on the server would flash the greeting at every returning member
 * for as long as hydration takes. Rendering "seen" costs a first-time visitor nothing
 * but a beat before it appears.
 */
function serverSeen(): boolean {
  return true;
}

export function FirstVisitHint() {
  const seen = useSyncExternalStore(subscribe, readSeen, serverSeen);

  if (seen) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Nothing to do. It closes for this page view either way.
    }
    window.dispatchEvent(new Event(SEEN_EVENT));
  }

  return (
    <aside
      aria-label="New here?"
      className="demo-step mb-8 flex max-w-xl flex-wrap items-center gap-x-4 gap-y-2 border-l-4 border-hut-yellow bg-sand-100 py-3 pl-4 pr-3"
    >
      {/*
        Does not repeat the lede three centimetres above it, which already says you
        tap three times a week. What this adds is where it all happens, which the page
        otherwise only implies through the name on a button.
      */}
      <p className="text-sm text-ink-700">
        <span className="font-semibold text-ink-900">First time here?</span> The whole
        league runs inside a Telegram group.
      </p>
      <Link
        href="/how-it-works"
        onClick={dismiss}
        className="text-sm font-semibold text-ink-900 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900"
      >
        Here&apos;s how it works
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-auto px-2 text-ink-400 hover:text-ink-900"
      >
        ✕
      </button>
    </aside>
  );
}

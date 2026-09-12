"use client";

import { useSyncExternalStore } from "react";

/**
 * Light, dark, or whatever the phone is doing.
 *
 * Three states rather than a switch. A two-way toggle can leave the system setting
 * but never return to it, so somebody who taps it once at night is stuck on dark
 * forever — including at midday. "Auto" is the default and is reachable again.
 *
 * The choice is the only thing stored: the *resolved* theme is never written down,
 * because a phone that flips to dark at sunset should take the page with it.
 */

const ORDER = ["system", "light", "dark"] as const;
type Choice = (typeof ORDER)[number];

const LABEL: Record<Choice, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

/** Shared with the blocking script in the document head. Keep them in step. */
export const THEME_STORAGE_KEY = "theme";

/** Fired on this tab, since `storage` only reaches the *other* ones. */
const THEME_EVENT = "themechange";

/**
 * Read through `useSyncExternalStore` rather than an effect.
 *
 * localStorage is exactly what that hook is for: state React does not own, which the
 * server cannot see and another tab can change underneath us. It also gets hydration
 * right for free — the server snapshot renders, then the real one replaces it —
 * where reading it in an effect means rendering the wrong label first and then
 * setting state during layout.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function readChoice(): Choice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Private windows and blocked site data both throw. The page still works; it
    // just follows the system every time.
    return "system";
  }
}

/** The server has no idea what this browser prefers, and says so. */
function serverChoice(): Choice {
  return "system";
}

function apply(choice: Choice): void {
  const root = document.documentElement;
  if (choice === "system") {
    // Removed rather than set to "system": the CSS keys off the attribute being
    // absent, which is what lets `prefers-color-scheme` take over again.
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }
}

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, readChoice, serverChoice);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
    apply(next);

    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Nothing to do — the attribute is already set, so this visit looks right.
    }

    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Colour theme: ${LABEL[choice]}. Change it.`}
      className="fixed bottom-4 right-4 z-50 border border-ink-900/25 bg-sand-50 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-ink-900 hover:text-ink-900"
    >
      {LABEL[choice]}
    </button>
  );
}

/**
 * Runs before the first paint, so a dark-mode visitor never gets a white flash.
 *
 * Inline and blocking on purpose: anything deferred runs after the browser has
 * already painted the light theme, which is the flash this exists to prevent. It
 * reads one key and sets one attribute.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})()`;

import Script from "next/script";
import { MiniApp } from "./mini-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Muizenberg Wednesdays",
  description: "Your player card, your form, and the season table.",
};

/**
 * The Mini App shell.
 *
 * `afterInteractive`, deliberately, not `beforeInteractive`.
 *
 * The first version blocked hydration until `telegram-web-app.js` had loaded from
 * telegram.org, which looks correct — the client component reads `window.Telegram` —
 * and is a trap. Anywhere that script is slow or unreachable, hydration never
 * happens, the effect never runs, and the page sits on "Checking who you are…"
 * forever with no error in sight. A browser test caught exactly that.
 *
 * So the script loads without blocking and the client waits a moment for
 * `window.Telegram` to appear instead. Inside Telegram it is there almost at once;
 * outside, the short wait expires and the page offers the desktop login, which is the
 * right answer in a browser anyway.
 */
export default function MiniAppPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <MiniApp />
    </>
  );
}

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
 * `telegram-web-app.js` has to be loaded before anything reads `window.Telegram`, so
 * it is `beforeInteractive` rather than the default. Outside Telegram the script is
 * harmless and simply leaves `window.Telegram` undefined, which is exactly the signal
 * the client component uses to offer the desktop login instead.
 */
export default function MiniAppPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <MiniApp />
    </>
  );
}

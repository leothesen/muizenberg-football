import Link from "next/link";
import { currentPlayer } from "@/lib/auth/current-user";
import { optionalEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Log in",
};

/**
 * The desktop door.
 *
 * Deliberately plain. Almost nobody should ever see this page — being in the Telegram
 * group is the whole of membership, and the Mini App needs no login at all — so it
 * exists for the one case the Mini App cannot serve: somebody at a laptop who wants
 * to look at the table.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [player, params] = await Promise.all([currentPlayer(), searchParams]);
  const configured = Boolean(optionalEnv("TELEGRAM_OAUTH_CLIENT_SECRET"));

  if (player) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-sand">
        <h1 className="mb-3 text-2xl font-semibold">
          {player.emoji} {player.display_name}
        </h1>
        <p className="mb-6 text-sand/70">You&rsquo;re signed in.</p>
        <Link className="text-hut-blue underline" href="/app">
          Go to your card
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16 text-sand">
      <h1 className="mb-3 text-2xl font-semibold">Log in</h1>
      <p className="mb-6 text-sand/70">
        There is no account and no password. Logging in just proves which Telegram user
        you are — the same thing being in the group already proves.
      </p>

      {params.error ? (
        <p className="mb-6 rounded-lg border border-hut-red/40 bg-hut-red/10 px-4 py-3 text-sm text-hut-red">
          That didn&rsquo;t work. Have another go.
        </p>
      ) : null}

      {configured ? (
        <a
          className="inline-block rounded-full bg-hut-blue px-5 py-2 font-medium text-pitch-900"
          href="/api/auth/login/start"
        >
          Log in with Telegram
        </a>
      ) : (
        <p className="rounded-lg border border-sand/20 px-4 py-3 text-sm text-sand/60">
          Web login isn&rsquo;t switched on yet. Open the bot in Telegram and use the menu
          button instead.
        </p>
      )}
    </main>
  );
}

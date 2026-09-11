import Link from "next/link";
import { currentPlayer } from "@/lib/auth/current-user";
import { optionalEnv } from "@/lib/env";
import { Hut, HutStripe } from "@/components/huts";

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
      <>
        <HutStripe />
        <main className="mx-auto max-w-md px-5 py-20">
          <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
            <Hut seed={player.display_name} size={24} />
            <span aria-hidden>{player.emoji}</span> {player.display_name}
          </h1>
          <p className="mt-3 text-ink-700">You&rsquo;re signed in.</p>
          <p className="mt-8">
            <Link
              href="/app"
              className="font-medium underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900"
            >
              Go to your card
            </Link>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <HutStripe />
      <main className="mx-auto max-w-md px-5 py-20">
        <h1 className="text-3xl font-extrabold tracking-tight">Log in</h1>
        <p className="mt-3 text-ink-700">
          There is no account and no password. Logging in just proves which Telegram
          user you are — the same thing being in the group already proves.
        </p>

        {params.error ? (
          <p className="mt-8 border-l-2 border-hut-red bg-sand-100 px-4 py-3 text-sm text-ink-900">
            That didn&rsquo;t work. Have another go.
          </p>
        ) : null}

        {configured ? (
          <p className="mt-8">
            <a
              className="inline-block bg-ink-900 px-5 py-2.5 font-semibold text-sand-50"
              href="/api/auth/login/start"
            >
              Log in with Telegram
            </a>
          </p>
        ) : (
          <p className="sand-shelf mt-8 p-4 text-sm text-ink-700">
            Web login isn&rsquo;t switched on yet. Open the bot in Telegram and use the
            menu button instead.
          </p>
        )}
      </main>
    </>
  );
}

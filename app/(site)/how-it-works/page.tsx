import { ChatBubble, ChatWindow } from "@/components/chat";
import { JoinButton, Page, Section } from "@/components/site";
import { demoTranscript } from "@/lib/demo/transcript";

export const metadata = {
  title: "How it works",
  description:
    "A week in the group chat: the bot asks which night, books it, takes names, picks the teams and writes the report.",
};

/**
 * The page for somebody who has not joined yet.
 *
 * The argument this page has to win is not "is this a good app" — it is "is this
 * worth installing a second messenger for". So it shows the thing itself: a real week
 * of real bot messages, rendered by the same functions that talk to the group, rather
 * than a feature list that describes them.
 *
 * Static and fully visible at rest. A step-through would be more fun and would also
 * mean the first thing a sceptical person sees is an empty box with a play button.
 */
export default function HowItWorksPage() {
  const transcript = demoTranscript();

  return (
    <Page
      eyebrow="Nobody is in charge"
      title="How it works"
      lede="There is no organiser and no sign-up. The bot runs the week, the group votes on the night, and the game happens unless nobody turns up."
    >
      <Section title="A week, in the group chat">
        <div className="grid gap-8 lg:grid-cols-[1fr_26rem] lg:items-start">
          <div className="order-2 lg:order-1">
            <ChatWindow>
              {transcript.map((message, index) => (
                <div key={index}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                    {message.when}
                  </p>
                  <ChatBubble message={message} />
                  {/*
                    The commentary sits under the bubble on a phone and beside the
                    column on a desktop. Inside the bubble it would read as something
                    the bot said, which is the one thing it must not look like.
                  */}
                  <p className="mt-2 max-w-lg text-sm text-ink-500 lg:hidden">
                    {message.note}
                  </p>
                </div>
              ))}
            </ChatWindow>
          </div>

          <ol className="order-1 hidden lg:order-2 lg:block">
            {transcript.map((message, index) => (
              <li key={index} className="border-b border-ink-900/10 py-4 last:border-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                  {message.when}
                </p>
                <p className="mt-1.5 text-sm text-ink-700">{message.note}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section title="The four rules">
        <ul className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
          <Rule title="Nobody is in charge">
            There are no admins and no organiser. Everything is a vote or a tap, and
            the bot does the chasing.
          </Rule>
          <Rule title="The game always happens">
            A thin turnout changes what gets played — a smaller format, a different
            game — never whether. Only the group calling it off calls it off.
          </Rule>
          <Rule title="Silence never kills a week">
            If nobody votes, it is the usual night. If nobody answers, it is still on.
            Muting the group costs you nothing.
          </Rule>
          <Rule title="Every number is self-reported">
            You type in your own goals and nobody checks. The league is for arguing
            about, not for the record.
          </Rule>
        </ul>
      </Section>

      <Section title="Joining is one tap">
        <p className="max-w-xl text-ink-700">
          There is no account, no password and no form. Being in the Telegram group is
          being in the league — the bot works out who you are from Telegram and your
          card starts the first time you play.
        </p>
        <div className="mt-6">
          <JoinButton />
        </div>
      </Section>
    </Page>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <h3 className="font-bold tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-ink-700">{children}</p>
    </li>
  );
}

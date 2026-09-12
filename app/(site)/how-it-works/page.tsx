import { DemoWalkthrough } from "@/components/demo-walkthrough";
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
 * Which means the page's own words are overhead, and it had a lot of them. Counting
 * the duplicates was the whole design exercise: "nobody is in charge" appeared five
 * times (eyebrow, lede, two step notes, a rule), "self-reported" three, "no sign-up"
 * four. None of the sentences were bad; there were just four channels all saying the
 * same four things, and a reader pays for every one of them.
 *
 * What replaced them is structure. The week alternates you/bot/you/bot/you/bot, so
 * labelling each step says "nobody is in charge" by demonstration, and the lede can
 * state the one countable fact the tour then proves.
 */
export default function HowItWorksPage() {
  const transcript = demoTranscript();

  return (
    <Page
      title="How it works"
      /*
        The whole page in eleven words, and it is a countable claim rather than a
        mood: the transcript below has exactly three "your turn" steps in it, so
        walking the tour proves the lede.

        What used to be here — "There is no organiser and no sign-up. The bot runs the
        week, the group votes on the night, and the game happens unless nobody turns
        up." — said the no-organiser thing that an eyebrow, two step notes and a rule
        all also said. Five statements of one fact.
      */
      /*
        No join button up here. This page is the argument, and asking for the join
        above the evidence puts the close before the pitch — the one at the foot of
        the page comes after somebody has actually seen the week.
      */
      lede="You tap three times a week. The bot does the rest."
    >
      {/*
        No section heading. It read "A week, in the group chat", above a drawing of a
        week in a group chat — a label on the only thing on screen.

        Built on the server, walked through on the client. The messages are rendered
        by the bot's own functions before this component exists, so the interactive
        version cannot say anything the real chat would not.
      */}
      {/*
        `xl`, not `2xl`. The bubble inside is capped at `lg` and the notes beside it
        are one line each now, so a wider shelf was just a band of empty sand down the
        right of every step — the container was wider than anything it held.
      */}
      <div className="max-w-xl">
        <DemoWalkthrough steps={transcript} />
      </div>

      {/*
        Two, not four. The other two were "nobody is in charge" — now the premise of
        the whole page — and "every number is self-reported", which the questionnaire
        step says and the site footer says again.

        What is left is the pair the transcript genuinely cannot show, because both are
        about weeks that do not look like the one drawn above: a thin week, and a week
        you ignore entirely. Those are also the two things a newcomer is actually
        nervous about, which is why they are worth the space.
      */}
      <Section title="Two things the chat won't show you">
        <ul className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
          <Rule title="The game always happens">
            A thin turnout changes what gets played — a smaller format, a different
            game — never whether. Only the group calling it off calls it off.
          </Rule>
          <Rule title="Silence costs you nothing">
            Skip the vote and it falls back to the night you last played. Skip the
            rest and you are simply not counted. Mute the group all season if you like.
          </Rule>
        </ul>
      </Section>

      {/*
        The 45-word paragraph that was here explained that there is no account, no
        password and no form. A button that says "Join the group on Telegram" and
        opens Telegram demonstrates that faster than any sentence about it can.
      */}
      <Section title="That's it">
        <JoinButton />
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

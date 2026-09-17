"use client";

import { useState } from "react";
import type { FormQuestion, ReportForm } from "@/lib/bot/report-form";
import { describeKickoff } from "@/domain/schedule";

/**
 * The post-match questionnaire, on a screen.
 *
 * It exists because the chat version cannot always be delivered. A Telegram bot may
 * not open a private chat — only reply in one somebody else started — so anyone who
 * has never messaged the bot has no DM to receive the questions in, and until now had
 * nowhere else to answer them. Their night simply went unrecorded, and the morning
 * after read as though nobody could be bothered.
 *
 * Still nothing is typed. Every answer is a tap on a number, exactly as in the chat,
 * and from the same list of numbers — a phone at dusk is not the place for a numeric
 * keypad, and an unbounded text field would put "goals: 900000" in the table the
 * first week. Skipping is a first-class answer rather than a failure to finish:
 * anything left untapped is simply not claimed.
 */

export interface OpenReport extends ReportForm {
  kickoffAt: string | null;
  venue: string | null;
}

type Answers = Record<string, number | string | null | undefined>;

export function ReportQuestionnaire({
  report,
  onFiled,
}: {
  report: OpenReport;
  onFiled: () => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [filing, setFiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answered = Object.values(answers).filter(
    (v) => v !== undefined && v !== null,
  ).length;

  async function file() {
    setFiling(true);
    setError(null);

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fixtureId: report.fixtureId, ...answers }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(
          body.error ?? "That did not go through. Try again in a moment.",
        );
        return;
      }

      onFiled();
    } catch {
      setError("That did not go through. Try again in a moment.");
    } finally {
      setFiling(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
        {report.kickoffAt
          ? describeKickoff(new Date(report.kickoffAt))
          : "Your last game"}
      </p>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">
        How did it go?
      </h1>
      <p className="mb-8 text-sm text-ink-500">
        You played for {report.teamName.toLowerCase()}. It&rsquo;s all
        self-reported and nobody checks — skip anything you&rsquo;d rather not
        claim.
      </p>

      <div className="space-y-8">
        {report.questions.map((question) => (
          <Question
            key={key(question)}
            question={question}
            chosen={answers[key(question)]}
            onChoose={(value) =>
              setAnswers((current) => ({
                ...current,
                // Tapping the same answer again clears it, which is the only way back
                // out of a mis-tap on a screen with no keyboard.
                [key(question)]:
                  current[key(question)] === value ? undefined : value,
              }))
            }
          />
        ))}
      </div>

      {error ? (
        <p className="mt-8 border-l-2 border-hut-red bg-sand-100 px-4 py-3 text-ink-900">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={file}
        disabled={filing}
        className="mt-8 w-full bg-ink-900 px-6 py-3 font-semibold text-sand-50 disabled:opacity-50"
      >
        {filing ? "Filing…" : "File it"}
      </button>
      <p className="mt-3 text-center text-sm text-ink-500">
        {answered === 0
          ? "Filing with nothing answered says you played and claimed none of it."
          : `${answered} of ${report.questions.length} answered. The rest stay blank.`}
      </p>
    </main>
  );
}

/** The answer key each question writes to, which is also the API's field name. */
function key(question: FormQuestion): string {
  return question.kind === "motm" ? "motmPlayerId" : question.field;
}

function Question({
  question,
  chosen,
  onChoose,
}: {
  question: FormQuestion;
  chosen: number | string | null | undefined;
  onChoose: (value: number | string) => void;
}) {
  return (
    <section>
      <h2 className="font-semibold text-ink-900">
        <span aria-hidden>{question.emoji}</span> {question.prompt}
      </h2>
      {question.hint ? (
        <p className="mt-1 text-sm text-ink-500">{question.hint}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {question.kind === "count"
          ? question.choices.map((choice) => (
              <Chip
                key={choice.value}
                label={choice.label}
                selected={chosen === choice.value}
                onClick={() => onChoose(choice.value)}
              />
            ))
          : question.peers.map((peer) => (
              <Chip
                key={peer.playerId}
                label={`${peer.emoji} ${peer.displayName}`}
                selected={chosen === peer.playerId}
                onClick={() => onChoose(peer.playerId)}
              />
            ))}
      </div>
    </section>
  );
}

/**
 * Big enough to hit outdoors, one-handed, at dusk. The selected state is a filled
 * block rather than a tint, because a tint is invisible in direct sunlight.
 */
function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        selected
          ? "min-w-[3rem] border border-ink-900 bg-ink-900 px-4 py-2.5 font-semibold text-sand-50"
          : "min-w-[3rem] border border-ink-900/20 bg-sand-50 px-4 py-2.5 font-semibold text-ink-900"
      }
    >
      {label}
    </button>
  );
}

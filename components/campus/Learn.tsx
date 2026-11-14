"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { LESSONS } from "@/lib/lessons";
import { useDrill } from "./drillStore";
import { KindPicker, ghost, primary } from "./ui";

function Quiz({ kind }: { kind: keyof typeof LESSONS }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const quiz = LESSONS[kind].quiz;
  const right = quiz.filter((q, i) => answers[i] === q.answer).length;
  return (
    <div className="space-y-4">
      {quiz.map((q, i) => {
        const picked = answers[i];
        return (
          <fieldset key={q.q} className="space-y-2">
            <legend className="font-semibold">
              {i + 1}. {q.q}
            </legend>
            <div className="mt-2 grid gap-1.5">
              {q.options.map((o, k) => {
                const shown = picked !== undefined;
                const tone = shown && k === q.answer ? "border-aman text-aman" : shown && k === picked ? "border-bahaya text-bahaya" : "border-malam-3";
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={shown}
                    aria-pressed={picked === k}
                    onClick={() => setAnswers({ ...answers, [i]: k })}
                    className={`flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-left disabled:cursor-default ${tone}`}
                  >
                    {shown && k === q.answer && <Check aria-hidden="true" className="size-4 shrink-0" />}
                    {shown && k === picked && k !== q.answer && <X aria-hidden="true" className="size-4 shrink-0" />}
                    {o}
                  </button>
                );
              })}
            </div>
            {picked !== undefined && (
              <p role="status">
                {picked === q.answer ? "Benar." : "Belum tepat."} {q.why}
              </p>
            )}
          </fieldset>
        );
      })}
      {Object.keys(answers).length === quiz.length && (
        <p className="font-semibold">
          Benar {right} dari {quiz.length}.
        </p>
      )}
    </div>
  );
}

// The procedure first, then a short quiz, then a practice run with the route shown and nothing at stake.
export default function Learn({ onGuided, onStart }: { onGuided: () => void; onStart: () => void }) {
  const kind = useDrill((s) => s.scenario.kind);
  const { steps } = LESSONS[kind];
  return (
    <div className="space-y-4">
      <KindPicker legend="Bencana" />
      <section className="space-y-2">
        <h2 className="font-bold">Langkah</h2>
        <ol className="list-decimal space-y-2 pl-5 marker:font-bold marker:text-fajar">
          {steps.map((s) => (
            <li key={s.title}>
              <strong>{s.title}</strong> {s.why}
            </li>
          ))}
        </ol>
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">Kuis</h2>
        <Quiz key={kind} kind={kind} />
      </section>
      <div className="grid gap-2">
        <button type="button" className={primary} onClick={onGuided}>
          Latihan terpandu
        </button>
        <button type="button" className={ghost} onClick={onStart}>
          Mulai simulasi
        </button>
      </div>
    </div>
  );
}

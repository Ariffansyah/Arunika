"use client";

import { ArrowRight, CircleCheck, OctagonX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HAZARD_ICON } from "@/components/hazards";
import { HAZARDS, type Hazard } from "@/lib/gladi";
import { LESSONS } from "@/lib/lessons";
import Instrument from "./Instrument";

const TAB = { gempa: "Gempa", banjir: "Banjir", angin: "Angin", longsor: "Longsor" };
const GAUGE = { gempa: "Seismograf", banjir: "Papan duga air", angin: "Anemometer", longsor: "Pemantau lereng" };

// The same steps and quiz the drill teaches before it starts, one hazard at a time.
export default function Lessons() {
  const [kind, setKind] = useState<Hazard>("gempa");
  const [picked, setPicked] = useState<number | null>(null);
  const { steps, quiz } = LESSONS[kind];
  const q = quiz[0];

  return (
    <section aria-labelledby="pelajari" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-end lg:gap-16">
        <div className="flex flex-col gap-10">
          <h2 id="pelajari" className="max-w-[20ch] text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Tiap bencana, urutan selamatnya beda.
          </h2>
          <fieldset className="sm:max-w-2xl">
            <legend className="sr-only">Bencana</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-malam-3 bg-malam-2 p-1 shadow-edge sm:grid-cols-4">
              {HAZARDS.map((k) => {
                const Icon = HAZARD_ICON[k];
                return (
                  <label
                    key={k}
                    className="flex min-h-14 items-center justify-center gap-2.5 rounded-md px-3 text-lg font-bold text-redup transition-colors duration-300 ease-crisp hover:bg-malam-3/50 hover:text-pasir has-checked:bg-laut has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-langit"
                  >
                    <input
                      type="radio"
                      name="lesson-kind"
                      className="sr-only"
                      checked={kind === k}
                      onChange={() => {
                        setKind(k);
                        setPicked(null);
                      }}
                    />
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    {TAB[k]}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
        <figure className="track flex flex-col overflow-hidden rounded-lg border border-malam-3 bg-malam-2 shadow-edge">
          <figcaption className="flex items-center gap-2 border-b border-malam-3 px-4 py-2.5 font-semibold">
            <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-langit" />
            {GAUGE[kind]}
          </figcaption>
          <div className="survey">
            <Instrument key={kind} kind={kind} className="block h-auto w-full animate-rise" />
          </div>
        </figure>
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16">
        <ol key={kind} className="divide-y divide-malam-3 border-y border-malam-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              style={{ animationDelay: `${i * 60}ms` }}
              className="grid animate-rise grid-cols-[3rem_1fr] gap-4 py-5 text-lg leading-relaxed sm:grid-cols-[4.5rem_1fr] sm:text-xl"
            >
              <span aria-hidden="true" className="font-mono text-3xl leading-none font-bold text-langit sm:text-4xl">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p>
                <strong>{s.title}</strong> <span className="text-redup">{s.why}</span>
              </p>
            </li>
          ))}
        </ol>

        <div key={`q-${kind}`} className="track self-start rounded-lg border border-malam-3 bg-malam-2 p-6 shadow-edge sm:p-7">
          <h3 className="text-2xl leading-snug font-extrabold tracking-tight">{q.q}</h3>
          <div role="group" aria-label="Jawaban" className="mt-6 space-y-2.5">
            {q.options.map((o, i) => {
              const right = i === q.answer;
              const shown = picked !== null && (right || i === picked);
              return (
                <button
                  key={o}
                  type="button"
                  disabled={picked !== null}
                  onClick={() => setPicked(i)}
                  className={`flex min-h-13 w-full items-center gap-3 rounded-md border px-4 py-3 text-left text-lg font-semibold transition-colors duration-300 ease-crisp enabled:hover:border-laut enabled:hover:bg-malam-3/40 enabled:active:translate-y-px ${
                    shown ? (right ? "border-aman bg-aman/10" : "border-bahaya bg-bahaya/10") : "border-malam-3 bg-malam"
                  } disabled:cursor-default`}
                >
                  <span className="flex-1">{o}</span>
                  {shown &&
                    (right ? (
                      <CircleCheck aria-label="Benar" className="size-5 shrink-0 text-aman" />
                    ) : (
                      <OctagonX aria-label="Salah" className="size-5 shrink-0 text-bahaya" />
                    ))}
                </button>
              );
            })}
          </div>
          <p role="status" className="text-lg leading-relaxed not-empty:mt-5">
            {picked !== null && (
              <>
                <strong className={picked === q.answer ? "text-aman" : "text-bahaya"}>{picked === q.answer ? "Tepat." : "Belum tepat."}</strong>{" "}
                <span className="text-redup">{q.why}</span>
              </>
            )}
          </p>
          <Link href="/sekolah" className="group mt-4 inline-flex min-h-11 items-center gap-2 text-lg font-bold text-langit">
            {quiz.length - 1} soal lagi di latihan
            <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}

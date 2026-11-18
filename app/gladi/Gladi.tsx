"use client";

import { CircleCheck, OctagonX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import RequireAuth, { type Me } from "@/components/RequireAuth";
import { COST_LABEL, LEVEL_LABEL, PRIORITY_LABEL, type Assessment } from "@/lib/assessment";
import { HAZARDS, HAZARD_LABEL, STEPS, quakeLine, type Feedback, type Inject, type Quake, type State, type Turn } from "@/lib/gladi";
import { authHeader } from "@/lib/supabase";

type Run =
  | { kind: "setup" }
  | { kind: "live"; state: State; token: string }
  | { kind: "done"; done: Turn[]; debrief: Assessment; saved: boolean };

const VERDICT = {
  tepat: { label: "Tepat", Icon: CircleCheck, tone: "text-aman", bar: "bg-aman" },
  kurang: { label: "Kurang tepat", Icon: TriangleAlert, tone: "text-fajar", bar: "bg-fajar" },
  berbahaya: { label: "Berbahaya", Icon: OctagonX, tone: "text-bahaya", bar: "bg-bahaya" },
};

const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

function Step({ inject, children }: { inject: Inject; children?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[4rem_1fr] gap-x-4 sm:grid-cols-[5.5rem_1fr] sm:gap-x-6">
      <span className="pt-0.5 text-xl font-extrabold tabular-nums text-langit sm:text-2xl">{inject.clock}</span>
      <div className="border-l border-malam-3 pb-10 pl-4 sm:pl-6">
        <p className="text-lg leading-relaxed">{inject.situation}</p>
        <p className="mt-2 text-lg font-bold">{inject.question}</p>
        {children}
      </div>
    </li>
  );
}

function Answered({ answer, feedback, waiting = false }: { answer: string; feedback?: Feedback; waiting?: boolean }) {
  const v = feedback && VERDICT[feedback.verdict];
  return (
    <>
      <p className="mt-4 rounded-md bg-malam-2 px-4 py-3 leading-relaxed">{answer}</p>
      {v ? (
        <p className="mt-3 flex gap-2.5 leading-relaxed">
          <v.Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${v.tone}`} />
          <span>
            <strong className={v.tone}>{v.label}.</strong> {feedback.note}
          </span>
        </p>
      ) : (
        waiting && <p role="status" className="mt-3 flex items-center gap-2.5 text-redup">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-langit" />
          AI menilai keputusan dan menyusun situasi berikutnya…
        </p>
      )}
    </>
  );
}

function Progress({ turns, current }: { turns: Turn[]; current: boolean }) {
  return (
    <ol aria-label="Langkah gladi" className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: STEPS }, (_, i) => {
        const t = turns[i];
        const label = t ? VERDICT[t.feedback.verdict].label : i === turns.length && current ? "sedang berjalan" : "belum";
        return (
          <li key={i} className="h-1.5 rounded-full bg-malam-3">
            <span
              className={`block h-full rounded-full ${t ? VERDICT[t.feedback.verdict].bar : i === turns.length && current ? "animate-pulse bg-langit" : ""}`}
            />
            <span className="sr-only">
              Langkah {i + 1}: {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Debrief({ a, saved, onAgain }: { a: Assessment; saved: boolean; onAgain: () => void }) {
  const tone = a.score >= 75 ? "text-aman" : a.score >= 45 ? "text-fajar" : "text-bahaya";
  return (
    <section aria-labelledby="hasil" className="space-y-6 rounded-xl border border-malam-3 bg-malam-2 p-5 sm:p-8">
      <h2 id="hasil" className="text-3xl font-extrabold tracking-tight">
        Skor gladi <span className={`tabular-nums ${tone}`}>{a.score}</span> dari 100. {LEVEL_LABEL[a.level]}.
      </h2>
      <p className="max-w-[65ch] text-lg leading-relaxed">{a.summary}</p>
      {a.observations.length > 0 && (
        <div>
          <h3 className="text-xl font-bold">Catatan</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-redup marker:text-langit">
            {a.observations.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      {a.recommendations.length > 0 && (
        <div>
          <h3 className="text-xl font-bold">Rencana tindak lanjut</h3>
          <ol className="mt-3 divide-y divide-malam-3 rounded-lg border border-malam-3 bg-malam">
            {a.recommendations.map((r) => (
              <li key={r.action} className="p-4 leading-relaxed">
                {r.action}{" "}
                <span className="text-redup">
                  (<span className={r.priority === "segera" ? "font-semibold text-fajar" : ""}>{PRIORITY_LABEL[r.priority].toLowerCase()}</span>,{" "}
                  {COST_LABEL[r.cost_band].toLowerCase()})
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p role="status" className={saved ? "text-aman" : "text-bahaya"}>
        {saved ? "Tersimpan ke dasbor kesiapan sekolah." : "Hasil tidak tersimpan ke dasbor. Coba gladi lagi nanti."}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="inline-flex min-h-12 items-center rounded-md bg-laut px-6 font-semibold text-white hover:bg-laut-terang active:translate-y-px"
        >
          Gladi lagi
        </button>
        <Link
          href="/dashboard"
          className="inline-flex min-h-12 items-center rounded-md border border-malam-3 px-6 font-semibold hover:border-redup active:translate-y-px"
        >
          Buka dasbor
        </Link>
      </div>
    </section>
  );
}

function Exercise({ me, quake }: { me: Me; quake: Quake | null }) {
  const [run, setRun] = useState<Run>({ kind: "setup" });
  const [answer, setAnswer] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<object | null>(null);

  async function send(body: object) {
    last.current = body;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gladi", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const out = await res.json();
      setRun(out.debrief ? { kind: "done", ...out } : { kind: "live", ...out });
      setAnswer(null);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function decide(text: string) {
    if (run.kind !== "live" || busy || !text.trim()) return;
    setAnswer(text.trim());
    send({ state: run.state, token: run.token, answer: text.trim() });
  }

  function again() {
    setRun({ kind: "setup" });
    setAnswer(null);
    setError(null);
  }

  const failure = error && (
    <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-bahaya">
      {error}
      <button
        type="button"
        onClick={() => last.current && send(last.current)}
        disabled={busy}
        className="min-h-11 rounded-md border border-bahaya/60 px-4 font-semibold hover:border-bahaya disabled:opacity-60"
      >
        Coba lagi
      </button>
    </div>
  );

  if (run.kind === "setup") {
    const school = me.school;
    return (
      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            send({ hazard: new FormData(e.currentTarget).get("hazard") });
          }}
        >
          <fieldset className="space-y-3">
            <legend className="mb-4 text-xl font-bold">Skenario</legend>
            {quake && (
              <label className="flex min-h-16 items-start gap-4 rounded-lg border border-malam-3 p-4 hover:border-redup has-checked:border-langit has-checked:bg-malam-2 has-focus-visible:outline-2 has-focus-visible:outline-langit">
                <input type="radio" name="hazard" value="bmkg" defaultChecked className="mt-1.5 size-4 shrink-0 accent-langit" />
                <span className="leading-relaxed">
                  <strong className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-langit" />
                    Gempa terkini BMKG
                  </strong>{" "}
                  <span className="text-redup">{quakeLine(quake)}</span>
                </span>
              </label>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {HAZARDS.map((h, i) => (
                <label
                  key={h}
                  className="flex min-h-14 items-center gap-3 rounded-lg border border-malam-3 px-4 font-semibold hover:border-redup has-checked:border-langit has-checked:bg-malam-2 has-focus-visible:outline-2 has-focus-visible:outline-langit"
                >
                  <input type="radio" name="hazard" value={h} defaultChecked={!quake && i === 0} className="size-4 shrink-0 accent-langit" />
                  {HAZARD_LABEL[h]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="max-w-[60ch] text-lg leading-relaxed text-redup">
            {school ? (
              <>
                Situasi disusun untuk <strong className="text-pasir">{school.name}</strong>: {school.floors} lantai,{" "}
                {school.material.replaceAll("_", " ")}, {fmt(school.coast_km)} km dari pantai.
              </>
            ) : (
              <>
                Akunmu belum terhubung ke sekolah, jadi situasinya memakai sekolah umum dan hasilnya tidak masuk dasbor sekolah mana pun.
              </>
            )}
          </p>
          {failure}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-14 items-center rounded-md bg-laut px-8 text-lg font-bold text-white hover:bg-laut-terang active:translate-y-px disabled:opacity-60"
          >
            {busy ? "Menyiapkan situasi…" : "Mulai gladi"}
          </button>
        </form>
        <aside aria-labelledby="cara" className="lg:border-l lg:border-malam-3 lg:pl-8">
          <h2 id="cara" className="text-xl font-bold">
            Cara kerja
          </h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 leading-relaxed text-redup marker:font-bold marker:text-langit">
            <li>AI menjadi pengendali latihan dan memberi {STEPS} situasi berurutan, disesuaikan dengan sekolahmu.</li>
            <li>Setiap keputusanmu dinilai dengan pedoman sekolah aman bencana. Situasi berikutnya adalah akibatnya.</li>
            <li>Di akhir, AI menyusun rencana tindak lanjut yang tersimpan sebagai skor kesiapan sekolah di dasbor.</li>
          </ol>
        </aside>
      </div>
    );
  }

  const turns = run.kind === "live" ? run.state.done : run.done;
  const pending = run.kind === "live" ? run.state.pending : null;
  const seed = run.kind === "live" ? run.state.seed : null;
  return (
    <div className="mt-8 max-w-3xl space-y-8">
      <Progress turns={turns} current={run.kind === "live"} />
      {seed?.quake && <p className="text-redup">Berdasarkan gempa BMKG {quakeLine(seed.quake)}.</p>}
      <ol>
        {turns.map((t) => (
          <Step key={t.inject.clock + t.answer} inject={t.inject}>
            <Answered answer={t.answer} feedback={t.feedback} />
          </Step>
        ))}
        {pending && (
          <Step inject={pending}>
            {answer ? (
              <Answered answer={answer} waiting={busy} />
            ) : (
              <form
                className="mt-5 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  decide(draft);
                }}
              >
                <div role="group" aria-label="Pilihan keputusan" className="space-y-2">
                  {pending.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      disabled={busy}
                      onClick={() => decide(o)}
                      className="block min-h-12 w-full rounded-lg border border-malam-3 px-4 py-3 text-left leading-snug hover:border-laut hover:bg-malam-2 active:translate-y-px disabled:opacity-60"
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <label htmlFor="sendiri" className="block pt-3 font-semibold">
                  Atau tulis keputusanmu sendiri
                </label>
                <div className="flex gap-2">
                  <textarea
                    id="sendiri"
                    rows={2}
                    maxLength={400}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        decide(draft);
                      }
                    }}
                    className="block min-h-12 w-full resize-y rounded-lg border border-malam-3 bg-malam-2 px-4 py-3 placeholder:text-redup hover:border-redup focus-visible:border-langit"
                  />
                  <button
                    type="submit"
                    disabled={busy || !draft.trim()}
                    className="min-h-12 shrink-0 self-end rounded-lg bg-laut px-5 font-semibold text-white hover:bg-laut-terang active:translate-y-px disabled:opacity-60"
                  >
                    Kirim
                  </button>
                </div>
              </form>
            )}
          </Step>
        )}
      </ol>
      {failure}
      {run.kind === "done" && <Debrief a={run.debrief} saved={run.saved} onAgain={again} />}
    </div>
  );
}

export default function Gladi({ quake }: { quake: Quake | null }) {
  return <RequireAuth>{(me) => <Exercise me={me} quake={quake} />}</RequireAuth>;
}

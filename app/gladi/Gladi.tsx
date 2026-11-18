"use client";

import { CircleCheck, Cpu, OctagonX, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import CampusPlan from "@/components/CampusPlan";
import { predict } from "@/components/campus/drillStore";
import RequireAuth, { type Me } from "@/components/RequireAuth";
import { COST_LABEL, LEVEL_LABEL, PRIORITY_LABEL, type Assessment } from "@/lib/assessment";
import { ASSEMBLY, BUILDINGS, MAP, buildingRects, tileAt, type Tile } from "@/lib/campus";
import {
  CLOCKS,
  HAZARD_LABEL,
  RISK_WORD,
  buildingStep,
  intensityLine,
  nameIn,
  openingRoom,
  quakeLine,
  routeAsk,
  routeStep,
  sweepAsk,
  type Hazard,
  type Inject,
  type Quake,
  type State,
  type Step,
} from "@/lib/gladi";
import { boardOf, riskTone, routeMove, targets, walk, type Target } from "@/lib/gladiBoard";
import { MAPS, type Setting } from "@/lib/maps";
import { INTENSITY } from "@/lib/sim";
import { authHeader } from "@/lib/supabase";

const VERDICT = {
  tepat: { label: "Tepat", Icon: CircleCheck, tone: "text-aman", bar: "bg-aman" },
  kurang: { label: "Kurang tepat", Icon: TriangleAlert, tone: "text-fajar", bar: "bg-fajar" },
  berbahaya: { label: "Berbahaya", Icon: OctagonX, tone: "text-bahaya", bar: "bg-bahaya" },
};
const HAZARD_FILL: Record<Hazard, string> = { gempa: "#ff6b6b", banjir: "#22ccee", longsor: "#c9874a", angin: "#7fd18b" };
const short = (id: string) => nameIn(MAP.id, id).replace(/^Gedung |^Titik Kumpul /, "").replace(" Guru & TU", "");
const RECTS = buildingRects();
const center = (id: string): [number, number] => {
  const r = RECTS[id];
  return [(r.x0 + r.x1 + 1) / 2, (r.z0 + r.z1 + 1) / 2];
};
// Where on the plan a building or an assembly point sits.
const spot = (id: string): [number, number] => {
  if (id in BUILDINGS) return center(id);
  const [x, z] = ASSEMBLY.find((a) => tileAt(...a) === id)!;
  return [x + 0.5, z + 0.5];
};

type Pick = "bmkg" | Hazard;
type RouteChoice = ReturnType<typeof routeMove>;
type Finished = { steps: Step[]; debrief: Assessment; saved: boolean };

function Board({
  hazard,
  risks,
  hazards,
  reveal,
  mode,
  from,
  options,
  safe,
  selected,
  route,
  best,
  pin,
  onPick,
  onPreview,
}: {
  hazard: Hazard;
  risks: Record<string, number>;
  hazards: Set<number>;
  reveal: boolean;
  mode: "idle" | "gedung" | "kumpul";
  from: string | null;
  options: Target[];
  safe: string[];
  selected: string | null;
  route: Tile[] | null;
  best: Tile[] | null;
  pin: [number, number] | null;
  onPick: (id: string) => void;
  onPreview: (id: string | null) => void;
}) {
  const active = (id: string) => (mode === "gedung" ? id in BUILDINGS : mode === "kumpul" && options.some((t) => t.id === id));
  const press = (id: string) => ({
    role: "button",
    tabIndex: 0,
    onClick: () => onPick(id),
    onPointerEnter: () => onPreview(id),
    onPointerLeave: () => onPreview(null),
    onFocus: () => onPreview(id),
    onBlur: () => onPreview(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPick(id);
      }
    },
    className: "cursor-pointer outline-none [&:focus-visible>.ring]:stroke-langit [&:hover>.ring]:stroke-langit",
  });
  return (
    <CampusPlan
      route={route ?? undefined}
      hazards={hazards}
      hazardColor={HAZARD_FILL[hazard]}
      label={`Denah kampus ${MAP.name} saat ${HAZARD_LABEL[hazard].toLowerCase()}, dengan risiko tiap gedung dan tujuan evakuasi`}
    >
      {best && (
        <polyline
          points={best.map(([x, z]) => `${x + 0.5},${z + 0.5}`).join(" ")}
          fill="none"
          stroke="#22ccee"
          strokeWidth={0.22}
          strokeDasharray="0.4 0.5"
          opacity={0.9}
        />
      )}
      {Object.keys(BUILDINGS).map((id) => {
        const r = RECTS[id];
        const [cx, cz] = center(id);
        const clickable = active(id);
        const body = (
          <>
            <rect
              className="ring"
              x={r.x0 - 0.15}
              y={r.z0 - 0.15}
              width={r.x1 - r.x0 + 1.3}
              height={r.z1 - r.z0 + 1.3}
              rx={0.35}
              fill={riskTone(risks[id])}
              fillOpacity={0.45}
              stroke={selected === id || from === id ? "#eaf1ff" : clickable ? "#eaf1ff80" : "none"}
              strokeWidth={selected === id || from === id ? 0.3 : 0.15}
              strokeDasharray={clickable && selected !== id ? "0.5 0.35" : undefined}
            />
            <text x={cx} y={reveal ? cz - 0.2 : cz + 0.35} textAnchor="middle" fontSize={short(id).length > 7 ? 0.72 : 0.95} fontWeight={700} fill="#071530">
              {short(id)}
            </text>
            {reveal && (
              <text x={cx} y={cz + 1} textAnchor="middle" fontSize={0.9} fontWeight={800} fill="#071530">
                {risks[id]}%
              </text>
            )}
          </>
        );
        return clickable ? (
          <g key={id} {...press(id)} aria-label={`${nameIn(MAP.id, id)}${reveal ? `, risiko ${RISK_WORD[hazard]} ${risks[id]}%` : ""}`}>
            {body}
          </g>
        ) : (
          <g key={id}>{body}</g>
        );
      })}
      {ASSEMBLY.map(([x, z]) => {
        const id = tileAt(x, z);
        const clickable = active(id);
        const body = (
          <>
            <circle className="ring" cx={x + 0.5} cy={z + 0.5} r={1.5} fill="#07153099" stroke={clickable ? "#eaf1ff80" : "none"} strokeWidth={0.15} strokeDasharray="0.5 0.35" />
            {reveal && !safe.includes(id) && (
              <path d={`M${x - 0.3} ${z - 0.3}L${x + 1.3} ${z + 1.3}M${x + 1.3} ${z - 0.3}L${x - 0.3} ${z + 1.3}`} stroke="#ff6b6b" strokeWidth={0.3} strokeLinecap="round" />
            )}
            <text
              x={x + 0.5}
              y={z - 1.3}
              textAnchor="middle"
              fontSize={0.9}
              fontWeight={700}
              fill="#eaf1ff"
              stroke="#071530"
              strokeWidth={0.25}
              paintOrder="stroke"
            >
              {short(id)}
            </text>
          </>
        );
        return clickable ? (
          <g key={id} {...press(id)} aria-label={nameIn(MAP.id, id)}>
            {body}
          </g>
        ) : (
          <g key={id}>{body}</g>
        );
      })}
      {pin && (
        <g aria-hidden="true">
          <circle cx={pin[0]} cy={pin[1]} r={1.4} fill="none" stroke="#ff8a3d" strokeWidth={0.3} className="animate-ping [transform-box:fill-box] [transform-origin:center]" />
          <circle cx={pin[0]} cy={pin[1]} r={0.55} fill="#ff8a3d" stroke="#071530" strokeWidth={0.15} />
        </g>
      )}
    </CampusPlan>
  );
}

function Verdict({ step }: { step: Step }) {
  const v = VERDICT[step.feedback.verdict];
  return (
    <p className="mt-2 flex gap-2 leading-relaxed">
      <v.Icon aria-hidden="true" className={`mt-1 size-4 shrink-0 ${v.tone}`} />
      <span>
        <strong className={v.tone}>{v.label}.</strong> {step.feedback.note}
      </span>
    </p>
  );
}

function Entry({ i, step }: { i: number; step: Step }) {
  const Who = step.move ? Cpu : Sparkles;
  return (
    <li className="border-t border-malam-3 py-4">
      <div className="flex items-center gap-2 text-sm text-redup">
        <span className="font-bold tabular-nums text-langit">{CLOCKS[i]}</span>
        <Who aria-hidden="true" className="size-3.5" />
        <span>{step.move ? "dinilai mesin simulasi" : "dinilai AI"}</span>
      </div>
      <p className="mt-1.5 leading-relaxed text-redup">
        {step.situation} {step.question}
      </p>
      <p className="mt-2 font-semibold">{step.answer}</p>
      <Verdict step={step} />
    </li>
  );
}

function Choices({ inject, busy, onDecide }: { inject: Inject; busy: boolean; onDecide: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onDecide(draft.trim());
      }}
    >
      <div role="group" aria-label="Pilihan keputusan" className="space-y-2">
        {inject.options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={busy}
            onClick={() => onDecide(o)}
            className="block min-h-12 w-full rounded-lg border border-malam-3 bg-malam px-4 py-3 text-left leading-snug hover:border-laut active:translate-y-px disabled:opacity-60"
          >
            {o}
          </button>
        ))}
      </div>
      <label htmlFor="sendiri" className="block pt-2 font-semibold">
        Atau tulis keputusanmu
      </label>
      <div className="flex gap-2">
        <input
          id="sendiri"
          maxLength={400}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="block min-h-11 w-full rounded-lg border border-malam-3 bg-malam px-3 hover:border-redup focus-visible:border-langit"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="min-h-11 shrink-0 rounded-lg bg-laut px-4 font-semibold text-white hover:bg-laut-terang disabled:opacity-60"
        >
          Kirim
        </button>
      </div>
    </form>
  );
}

function Debrief({ a, saved }: { a: Assessment; saved: boolean }) {
  const tone = a.score >= 75 ? "text-aman" : a.score >= 45 ? "text-fajar" : "text-bahaya";
  return (
    <section aria-labelledby="hasil" className="space-y-5 border-t border-malam-3 pt-5">
      <h2 id="hasil" className="text-2xl font-extrabold tracking-tight">
        Skor gladi <span className={`tabular-nums ${tone}`}>{a.score}</span> dari 100. {LEVEL_LABEL[a.level]}.
      </h2>
      <p className="leading-relaxed">{a.summary}</p>
      {a.observations.length > 0 && (
        <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-redup marker:text-langit">
          {a.observations.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      )}
      {a.recommendations.length > 0 && (
        <div>
          <h3 className="font-bold">Rencana tindak lanjut</h3>
          <ol className="mt-2 divide-y divide-malam-3 rounded-lg border border-malam-3 bg-malam">
            {a.recommendations.map((r) => (
              <li key={r.action} className="p-3 leading-relaxed">
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
        <a href={`/gladi?peta=${MAP.id}`} className="inline-flex min-h-11 items-center rounded-md bg-laut px-5 font-semibold text-white hover:bg-laut-terang">
          Gladi lagi
        </a>
        <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-md border border-malam-3 px-5 font-semibold hover:border-redup">
          Buka dasbor
        </Link>
      </div>
    </section>
  );
}

function Table({ me, quake }: { me: Me; quake: Quake | null }) {
  const disasters = MAP.disasters as Hazard[];
  const [pick, setPick] = useState<Pick>(quake ? "bmkg" : "gempa");
  const hazard: Hazard = pick === "bmkg" ? "gempa" : pick;
  const intensity = pick === "bmkg" && quake ? Math.min(8, Math.max(5, quake.magnitude)) : INTENSITY[hazard].start;
  const p = useMemo(() => predict({ kind: hazard, intensity }, me.school, new Date().getFullYear()), [hazard, intensity, me.school]);
  const board = useMemo(() => boardOf(hazard, intensity, p), [hazard, intensity, p]);

  const [live, setLive] = useState<{ state: State; token: string } | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [sweep, setSweep] = useState<string | null>(null);
  const [go, setGo] = useState<RouteChoice | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
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
      if (out.debrief) setFinished(out);
      else setLive(out);
      setAnswer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const server = finished?.steps ?? live?.state.steps ?? [];
  // The two map steps are judged in the browser with the same rules the server applies when they are sent.
  const local = [
    ...(server.length === 1 && sweep ? [buildingStep(hazard, board, sweep)] : []),
    ...(server.length === 1 && sweep && go ? [routeStep(hazard, board, go.move)] : []),
  ];
  const steps = [...server, ...local];
  const pending = finished ? null : (live?.state.pending ?? null);
  const stage = finished ? "selesai" : !live ? "siap" : pending ? (server.length === 0 ? "aksi" : "susulan") : !sweep ? "gedung" : !go ? "kumpul" : "lanjut";
  const options = sweep ? targets(hazard, sweep) : [];
  const hovered = stage === "kumpul" ? options.find((t) => t.id === preview) : undefined;
  const previewRoute = sweep && hovered ? walk(sweep, hovered.tile, p.hazards) : null;
  const kumpul = steps[2]?.move?.target;
  const pin = stage === "aksi" ? center(openingRoom(board)) : stage === "susulan" && kumpul ? spot(kumpul) : null;
  const ask = stage === "gedung" ? sweepAsk(hazard) : stage === "kumpul" && sweep ? routeAsk(hazard, MAP.id, sweep) : null;

  function decide(text: string) {
    if (!live || busy) return;
    setAnswer(text);
    send({ state: live.state, token: live.token, answer: text });
  }

  function onPick(id: string) {
    if (stage === "gedung" && id in BUILDINGS) setSweep(id);
    else if (stage === "kumpul" && sweep) {
      const t = options.find((o) => o.id === id);
      if (t) setGo(routeMove(hazard, board, p, sweep, t));
    }
  }

  const campuses = Object.keys(MAPS) as Setting[];
  const status = (
    <p className="text-redup">
      {MAP.name} · {pick === "bmkg" && quake ? `gempa BMKG ${quakeLine(quake)}` : `${HAZARD_LABEL[hazard].toLowerCase()}, ${intensityLine(hazard, intensity)}`}
    </p>
  );

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
      <div className="sticky top-0 z-10 space-y-3 bg-malam py-2 lg:top-4 lg:py-0">
        {stage === "siap" && (
          // Each campus is its own page load: the engine fixes its grid when the page opens.
          <nav aria-label="Kampus" className="flex flex-wrap gap-2">
            {campuses.map((id) =>
              id === MAP.id ? (
                <span key={id} aria-current="page" className="inline-flex min-h-11 items-center rounded-md bg-laut px-4 font-semibold text-white">
                  {MAPS[id]!.name}
                </span>
              ) : (
                <a key={id} href={`/gladi?peta=${id}`} className="inline-flex min-h-11 items-center rounded-md border border-malam-3 px-4 font-semibold hover:border-redup">
                  {MAPS[id]!.name}
                </a>
              ),
            )}
          </nav>
        )}
        <div className="overflow-hidden rounded-xl border border-malam-3 bg-malam shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)]">
          <Board
            hazard={hazard}
            risks={board.risks}
            hazards={p.hazards}
            reveal={!!sweep || stage === "selesai"}
            mode={stage === "gedung" ? "gedung" : stage === "kumpul" ? "kumpul" : "idle"}
            from={sweep}
            options={options}
            safe={board.safe}
            selected={go?.move.target ?? null}
            route={go?.route ?? previewRoute?.route ?? null}
            best={go && go.move.best !== go.move.target ? go.bestRoute : null}
            pin={pin}
            onPick={onPick}
            onPreview={setPreview}
          />
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-malam-3 px-4 py-3 text-sm">
            {[
              ["#34c47c", "Risiko < 30%"],
              ["#f0b429", "30–59%"],
              ["#ff6b6b", "≥ 60%"],
            ].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="size-3.5 rounded-sm opacity-80" style={{ background: c }} />
                {l}
              </span>
            ))}
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3.5 rounded-sm opacity-60" style={{ background: HAZARD_FILL[hazard] }} />
              Bahaya {HAZARD_LABEL[hazard].toLowerCase()}
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="h-1 w-6 rounded-full bg-fajar" />
              Rute
            </span>
            {go && go.move.best !== go.move.target && (
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="h-1 w-6 rounded-full bg-langit" />
                Rute terbaik
              </span>
            )}
          </div>
        </div>
      </div>

      <section aria-label="Log gladi" className="rounded-xl border border-malam-3 bg-malam-2 p-5">
        {stage === "siap" ? (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              send({ hazard: pick, board });
            }}
          >
            <fieldset className="space-y-2">
              <legend className="mb-3 text-xl font-bold">Skenario</legend>
              {quake && (
                <label className="flex items-start gap-3 rounded-lg border border-malam-3 bg-malam p-3 hover:border-redup has-checked:border-langit has-focus-visible:outline-2 has-focus-visible:outline-langit">
                  <input type="radio" name="hazard" checked={pick === "bmkg"} onChange={() => setPick("bmkg")} className="mt-1.5 size-4 shrink-0 accent-langit" />
                  <span className="leading-relaxed">
                    <strong>Gempa terkini BMKG</strong> <span className="text-redup">{quakeLine(quake)}</span>
                  </span>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                {disasters.map((h) => (
                  <label
                    key={h}
                    className="flex min-h-12 items-center gap-3 rounded-lg border border-malam-3 bg-malam px-3 font-semibold hover:border-redup has-checked:border-langit has-focus-visible:outline-2 has-focus-visible:outline-langit"
                  >
                    <input type="radio" name="hazard" checked={pick === h} onChange={() => setPick(h)} className="size-4 shrink-0 accent-langit" />
                    {HAZARD_LABEL[h]}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="leading-relaxed text-redup">
              Peta di samping sudah dihitung mesin simulasi untuk{" "}
              <strong className="text-pasir">{me.school?.name ?? "sekolah umum"}</strong>. Langkah 1 dan 4 disusun AI; langkah 2 dan 3 kamu putuskan langsung di peta.
            </p>
            {error && <p role="alert" className="text-bahaya">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-laut px-6 text-lg font-bold text-white hover:bg-laut-terang active:translate-y-px disabled:opacity-60"
            >
              {busy ? "AI menyusun situasi…" : "Mulai gladi"}
            </button>
          </form>
        ) : (
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-4xl font-extrabold tabular-nums text-langit">{CLOCKS[Math.min(steps.length, 3)]}</span>
              <ol aria-label="Langkah gladi" className="flex flex-1 gap-1.5">
                {CLOCKS.map((c, i) => (
                  <li key={c} className="h-1.5 flex-1 rounded-full bg-malam-3">
                    <span className={`block h-full rounded-full ${steps[i] ? VERDICT[steps[i].feedback.verdict].bar : i === steps.length ? "animate-pulse bg-langit" : ""}`} />
                    <span className="sr-only">
                      Langkah {i + 1}: {steps[i] ? VERDICT[steps[i].feedback.verdict].label : "belum"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-2">{status}</div>
            <ol className="mt-3">
              {steps.map((s, i) => (
                <Entry key={i} i={i} step={s} />
              ))}
            </ol>

            {(stage === "aksi" || stage === "susulan") && pending && (
              <div className="border-t border-malam-3 pt-4">
                <div className="flex items-center gap-2 text-sm text-redup">
                  <span className="font-bold tabular-nums text-langit">{CLOCKS[steps.length]}</span>
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  <span>dari pengendali AI</span>
                </div>
                <p className="mt-1.5 text-lg leading-relaxed">{pending.situation}</p>
                <p className="mt-2 text-lg font-bold">{pending.question}</p>
                {answer ? (
                  <>
                    <p className="mt-3 font-semibold">{answer}</p>
                    {busy && (
                      <p role="status" className="mt-2 flex items-center gap-2 text-redup">
                        <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-langit" />
                        AI menilai keputusan…
                      </p>
                    )}
                  </>
                ) : (
                  <Choices key={steps.length} inject={pending} busy={busy} onDecide={decide} />
                )}
              </div>
            )}

            {(stage === "gedung" || stage === "kumpul") && (
              <div className="border-t border-malam-3 pt-4">
                <div className="flex items-center gap-2 text-sm text-redup">
                  <span className="font-bold tabular-nums text-langit">{CLOCKS[steps.length]}</span>
                  <Cpu aria-hidden="true" className="size-3.5" />
                  <span>keputusan di peta</span>
                </div>
                <p className="mt-1.5 text-lg leading-relaxed">{ask?.situation}</p>
                <p className="mt-2 text-lg font-bold">{ask?.question}</p>
                <p className="mt-3 text-redup">Klik di peta, atau pilih:</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(stage === "gedung" ? Object.keys(BUILDINGS) : options.map((t) => t.id)).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onPick(id)}
                      onPointerEnter={() => setPreview(id)}
                      onPointerLeave={() => setPreview(null)}
                      onFocus={() => setPreview(id)}
                      onBlur={() => setPreview(null)}
                      className="min-h-11 rounded-lg border border-malam-3 bg-malam px-3 py-2 text-left font-semibold leading-snug hover:border-laut"
                    >
                      {nameIn(MAP.id, id)}
                    </button>
                  ))}
                </div>
                {previewRoute?.route && (
                  <p role="status" className="mt-3 tabular-nums text-langit">
                    {previewRoute.meters} m, sekitar {Math.round(previewRoute.meters / 1.5)} detik berjalan
                  </p>
                )}
              </div>
            )}

            {stage === "lanjut" && (
              <div className="border-t border-malam-3 pt-4">
                {error ? null : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => live && go && send({ state: live.state, token: live.token, moves: [{ target: sweep }, go.move] })}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-laut px-6 font-bold text-white hover:bg-laut-terang disabled:opacity-60"
                  >
                    {busy ? "AI menyusun kejadian berikutnya…" : "Lanjut"}
                  </button>
                )}
              </div>
            )}

            {error && (
              <div role="alert" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-bahaya">
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
            )}

            {finished && <Debrief a={finished.debrief} saved={finished.saved} />}
          </div>
        )}
      </section>
    </div>
  );
}

export default function Gladi({ quake }: { quake: Quake | null }) {
  return <RequireAuth>{(me) => <Table me={me} quake={quake} />}</RequireAuth>;
}

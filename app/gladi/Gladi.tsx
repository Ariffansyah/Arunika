"use client";

import { CircleCheck, Cpu, OctagonX, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import CampusPlan from "@/components/CampusPlan";
import { predict } from "@/components/campus/drillStore";
import { HAZARD_ICON } from "@/components/hazards";
import RequireAuth, { type Me } from "@/components/RequireAuth";
import { useReducedMotion } from "@/components/useReducedMotion";
import { COST_LABEL, LEVEL_LABEL, PRIORITY_LABEL, type Assessment } from "@/lib/assessment";
import { ASSEMBLY, BUILDINGS, H, MAP, W, buildingRects, shortName, tileAt, type Tile } from "@/lib/campus";
import { num } from "@/lib/format";
import {
  CLOCKS,
  HAZARD_LABEL,
  RISK_WORD,
  buildingStep,
  distanceKm,
  intensityLine,
  nameIn,
  occupants,
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
// Two steps written and judged by the AI controller, two decided on the plan and judged by the engine.
const STEPS = [
  { name: "Situasi pembuka", short: "Awal", map: false },
  { name: "Gedung yang disisir", short: "Gedung", map: true },
  { name: "Titik kumpul dan rute", short: "Rute", map: true },
  { name: "Kejadian susulan", short: "Susulan", map: false },
];
const HAZARD_FILL: Record<Hazard, string> = { gempa: "#ff6b6b", banjir: "#22ccee", longsor: "#c9874a", angin: "#7fd18b" };
const short = (id: string) => shortName(nameIn(MAP.id, id));
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
      label={`Denah sekolah ${MAP.name} saat ${HAZARD_LABEL[hazard].toLowerCase()}, dengan risiko tiap gedung dan tujuan evakuasi`}
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
            {risks[id] >= 60 && (
              <rect
                x={r.x0 - 0.45}
                y={r.z0 - 0.45}
                width={r.x1 - r.x0 + 1.9}
                height={r.z1 - r.z0 + 1.9}
                rx={0.5}
                fill="none"
                stroke="#ff6b6b"
                strokeWidth={0.2}
                pointerEvents="none"
                className="motion-safe:animate-pulse"
              />
            )}
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
            <circle
              className="ring"
              cx={x + 0.5}
              cy={z + 0.5}
              r={1.5}
              fill="#07153099"
              stroke={selected === id ? "#eaf1ff" : clickable ? "#eaf1ff80" : "none"}
              strokeWidth={selected === id ? 0.3 : 0.15}
              strokeDasharray={selected === id ? undefined : "0.5 0.35"}
            />
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

// One step of the log: the exercise clock and who judges it in the margin, the step itself beside them.
function Slot({ i, children, as: Tag = "div" }: { i: number; children: React.ReactNode; as?: "div" | "li" }) {
  const Who = STEPS[i].map ? Cpu : Sparkles;
  const who = STEPS[i].map ? "Dinilai mesin simulasi" : "Dari pengendali AI";
  return (
    <Tag className="grid grid-cols-[3.25rem_1fr] gap-3 border-t border-malam-3 py-4">
      <span className="flex flex-col items-start gap-2 pt-0.5 font-mono font-bold text-langit">
        {CLOCKS[i]}
        <span title={who} className="text-redup">
          <Who aria-hidden="true" className="size-4" />
          <span className="sr-only">{who}</span>
        </span>
      </span>
      <div>{children}</div>
    </Tag>
  );
}

function Entry({ i, step }: { i: number; step: Step }) {
  return (
    <Slot as="li" i={i}>
      <p className="leading-relaxed text-redup">
        {step.situation} {step.question}
      </p>
      <p className="mt-2 font-semibold">{step.answer}</p>
      <Verdict step={step} />
    </Slot>
  );
}

function Choices({ inject, busy, onDecide }: { inject: Inject; busy: boolean; onDecide: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  // Keys 1 to 3 pick an option, unless the participant is typing their own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (busy || !(i >= 0 && i < inject.options.length) || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      onDecide(inject.options[i]);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onDecide(draft.trim());
      }}
    >
      <div role="group" aria-label="Pilihan keputusan" className="space-y-2">
        {inject.options.map((o, i) => (
          <button
            key={o}
            type="button"
            disabled={busy}
            onClick={() => onDecide(o)}
            className="group flex min-h-12 w-full items-start gap-3 rounded-lg border border-malam-3 bg-malam px-4 py-3 text-left leading-snug transition-colors hover:border-laut active:translate-y-px disabled:opacity-60"
          >
            <kbd aria-hidden="true" className="mt-px shrink-0 text-redup group-hover:border-laut group-hover:text-pasir">
              {i + 1}
            </kbd>
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

// The step the AI is still writing: its clock, and placeholder lines where the text will land.
function Writing({ i, text }: { i: number; text: string }) {
  return (
    <Slot i={i}>
      <p role="status" className="flex items-center gap-2 text-redup">
        <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-langit" />
        {text}
      </p>
      <span aria-hidden="true" className="mt-3 block space-y-2">
        {["w-full", "w-11/12", "w-3/5"].map((w) => (
          <span key={w} className={`skeleton block h-5 ${w}`} />
        ))}
      </span>
    </Slot>
  );
}

// The plan's situation board: who is in each building, and once the sweep is decided, how risky each one is.
function Occupancy({ risks, reveal, focus }: { risks: Record<string, number>; reveal: boolean; focus: string | null }) {
  return (
    <ul aria-label="Penghuni gedung" className="hidden grid-cols-3 gap-px border-t border-malam-3 bg-malam-3 lg:grid">
      {Object.keys(BUILDINGS).map((id) => (
        <li key={id} className={`px-3 py-2.5 transition-colors duration-300 ${focus === id ? "bg-malam-2" : "bg-malam"}`}>
          <p className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{short(id)}</span>
            <span className="shrink-0 tabular-nums text-redup">{occupants(MAP.id, id)} orang</span>
          </p>
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-malam-3">
            {reveal && (
              <span className="block h-full origin-left rounded-full motion-safe:animate-grow" style={{ width: `${risks[id]}%`, background: riskTone(risks[id]) }} />
            )}
          </span>
          {reveal && <span className="sr-only">, risiko {risks[id]}%</span>}
        </li>
      ))}
    </ul>
  );
}

function Debrief({ a, saved, steps }: { a: Assessment; saved: boolean; steps: Step[] }) {
  const tone = a.score >= 75 ? "text-aman" : a.score >= 45 ? "text-fajar" : "text-bahaya";
  return (
    <section aria-labelledby="hasil" className="space-y-5 border-t border-malam-3 pt-5 motion-safe:animate-rise">
      <h2 id="hasil" className="text-2xl font-extrabold tracking-tight">
        Skor gladi <span className={`tabular-nums ${tone}`}>{a.score}</span> dari 100. {LEVEL_LABEL[a.level]}.
      </h2>
      <table className="w-full text-left">
        <caption className="sr-only">Nilai tiap langkah; skor gladi adalah rata-ratanya</caption>
        <thead className="text-redup">
          <tr>
            <th className="pb-2 font-semibold">Pukul</th>
            <th className="pb-2 font-semibold">Langkah</th>
            <th className="pb-2 font-semibold">Penilaian</th>
            <th className="pb-2 text-right font-semibold">Poin</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const v = VERDICT[s.feedback.verdict];
            return (
              <tr key={i} className="border-t border-malam-3">
                <td className="py-2.5 font-mono font-bold text-langit">{CLOCKS[i]}</td>
                <td className="py-2.5">{STEPS[i].short}</td>
                <td className={`py-2.5 ${v.tone}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <v.Icon aria-hidden="true" className="size-4 shrink-0" />
                    {v.label}
                  </span>
                </td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{s.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const [strength, setStrength] = useState<Partial<Record<Hazard, number>>>({});
  const meta = INTENSITY[hazard];
  const intensity = pick === "bmkg" && quake ? Math.min(8, Math.max(5, quake.magnitude)) : (strength[hazard] ?? meta.start);
  const p = useMemo(() => predict({ kind: hazard, intensity }, me.school, new Date().getFullYear()), [hazard, intensity, me.school]);
  const board = useMemo(() => boardOf(hazard, intensity, p), [hazard, intensity, p]);

  const [live, setLive] = useState<{ state: State; token: string } | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [sweep, setSweep] = useState<string | null>(null);
  const [go, setGo] = useState<RouteChoice | null>(null);
  // A pick on the plan is held here until it is confirmed, so its route can be looked at first, on touch too.
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<object | null>(null);
  const plan = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);
  const confirmBox = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

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
  const options = useMemo(() => (sweep ? targets(hazard, sweep) : []), [hazard, sweep]);
  const reach = useMemo(() => Object.fromEntries(options.map((t) => [t.id, walk(sweep!, t.tile, p.hazards)])), [options, sweep, p.hazards]);
  const previewRoute = stage === "kumpul" ? (reach[preview ?? ""] ?? reach[draft ?? ""] ?? null) : null;
  const kumpul = steps[2]?.move?.target;
  const pin = stage === "aksi" ? center(openingRoom(board)) : stage === "susulan" && kumpul ? spot(kumpul) : null;
  const ask = stage === "gedung" ? sweepAsk(hazard) : stage === "kumpul" && sweep ? routeAsk(hazard, MAP.id, sweep) : null;
  const far = pick === "bmkg" && quake && me.school ? distanceKm(me.school, quake) : null;

  // Bring each new step into view. On phones the pinned plan covers the top of the log, so the step must clear it.
  useEffect(() => {
    const el = current.current;
    if (!el || stage === "siap") return;
    const covered = plan.current && !matchMedia("(min-width: 64rem)").matches && getComputedStyle(plan.current).position === "sticky";
    el.style.scrollMarginTop = `${(covered ? plan.current!.offsetHeight : 0) + 16}px`;
    el.style.scrollMarginBottom = "16px";
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  }, [stage, reduced]);

  // The confirm button lands under the choices, often below the fold.
  useEffect(() => {
    if (draft) confirmBox.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  }, [draft, reduced]);

  // The signed state lives only in this page, so a reload mid-exercise would lose it: the browser asks first.
  useEffect(() => {
    if (!live || finished) return;
    const hold = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", hold);
    return () => removeEventListener("beforeunload", hold);
  }, [live, finished]);

  function decide(text: string) {
    if (!live || busy) return;
    setAnswer(text);
    send({ state: live.state, token: live.token, answer: text });
  }

  function onPick(id: string) {
    if ((stage === "gedung" && id in BUILDINGS) || (stage === "kumpul" && id in reach)) setDraft(id);
  }

  function confirm() {
    const t = options.find((o) => o.id === draft);
    if (stage === "gedung" && draft) setSweep(draft);
    else if (stage === "kumpul" && sweep && t) setGo(routeMove(hazard, board, p, sweep, t));
    setDraft(null);
  }

  const campuses = Object.keys(MAPS) as Setting[];
  const status = `${MAP.name} · ${pick === "bmkg" && quake ? `gempa BMKG ${quakeLine(quake)}` : `${HAZARD_LABEL[hazard].toLowerCase()}, ${intensityLine(hazard, intensity)}`}`;
  const chosen = draft && stage === "kumpul" ? reach[draft] : null;

  return (
    <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
      <div
        ref={plan}
        className={`z-10 space-y-3 lg:sticky lg:top-4 ${stage === "gedung" || stage === "kumpul" ? "max-lg:sticky max-lg:top-0 max-lg:bg-malam max-lg:py-2" : ""}`}
      >
        {stage === "siap" && (
          // Each campus is its own page load: the engine fixes its grid when the page opens.
          <nav aria-label="Peta" className="flex flex-wrap gap-2">
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
        <div className="overflow-hidden rounded-lg border border-malam-3 bg-malam shadow-edge">
          {stage !== "siap" && (
            <p className="flex items-center gap-2.5 border-b border-malam-3 bg-malam-2 px-4 py-3">
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-full bg-langit ${stage === "selesai" ? "" : "animate-pulse"}`} />
              <span className="min-w-0 truncate">{status}</span>
            </p>
          )}
          <Board
            hazard={hazard}
            risks={board.risks}
            hazards={p.hazards}
            reveal={!!sweep || stage === "selesai"}
            mode={stage === "gedung" ? "gedung" : stage === "kumpul" ? "kumpul" : "idle"}
            from={sweep}
            options={options}
            safe={board.safe}
            selected={go?.move.target ?? draft}
            route={go?.route ?? previewRoute?.route ?? null}
            best={go && go.move.best !== go.move.target ? go.bestRoute : null}
            pin={pin}
            onPick={onPick}
            onPreview={setPreview}
          />
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-malam-3 px-4 py-3">
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
          <Occupancy risks={board.risks} reveal={!!sweep || stage === "selesai"} focus={preview ?? draft} />
        </div>
      </div>

      <section aria-label="Log gladi" className="rounded-lg border border-malam-3 bg-malam-2 p-5 shadow-edge">
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
                <label className="flex items-start gap-3 rounded-lg border border-malam-3 bg-malam p-3 transition-colors hover:border-redup has-checked:border-langit has-checked:bg-langit/10 has-focus-visible:outline-2 has-focus-visible:outline-langit">
                  <input type="radio" name="hazard" checked={pick === "bmkg"} onChange={() => setPick("bmkg")} className="sr-only" />
                  <HAZARD_ICON.gempa aria-hidden="true" className="mt-1 size-5 shrink-0 text-langit" />
                  <span className="leading-relaxed">
                    <strong>Gempa terkini BMKG</strong>{" "}
                    <span className="text-redup">
                      {quakeLine(quake)}
                      {far !== null && `, ${num(far)} km dari sekolah`}
                    </span>
                  </span>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                {disasters.map((h) => {
                  const Icon = HAZARD_ICON[h];
                  return (
                    <label
                      key={h}
                      className="flex min-h-12 items-center gap-3 rounded-lg border border-malam-3 bg-malam px-3 py-2 leading-snug font-semibold transition-colors hover:border-redup has-checked:border-langit has-checked:bg-langit/10 has-focus-visible:outline-2 has-focus-visible:outline-langit"
                    >
                      <input type="radio" name="hazard" checked={pick === h} onChange={() => setPick(h)} className="sr-only" />
                      <Icon aria-hidden="true" className="size-5 shrink-0 text-langit" />
                      {HAZARD_LABEL[h]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {pick !== "bmkg" && (
              // The engine redraws the hazard on the plan as this moves.
              <label htmlFor="kekuatan" className="block font-semibold">
                {meta.label} <span className="font-mono text-langit">{`${num(intensity, meta.step < 1 ? 1 : 0)} ${meta.unit}`.trim()}</span>
                <input
                  id="kekuatan"
                  type="range"
                  min={meta.range[0]}
                  max={meta.range[1]}
                  step={meta.step}
                  value={intensity}
                  onChange={(e) => setStrength({ ...strength, [hazard]: Number(e.target.value) })}
                  style={{ "--fill": `${((intensity - meta.range[0]) / (meta.range[1] - meta.range[0])) * 100}%` } as CSSProperties}
                  className="range mt-2 block w-full"
                />
              </label>
            )}
            <ol aria-label="Langkah gladi" className="divide-y divide-malam-3 rounded-lg border border-malam-3 bg-malam">
              {STEPS.map(({ name, map }, i) => {
                const Who = map ? Cpu : Sparkles;
                return (
                  <li key={name} className="flex min-h-12 items-center gap-3 px-3 py-2">
                    <span className="w-12 font-mono font-bold text-langit">{CLOCKS[i]}</span>
                    <span className="flex-1 font-semibold">{name}</span>
                    <span className="inline-flex items-center gap-1.5 text-redup">
                      <Who aria-hidden="true" className="size-4" />
                      {map ? "Peta" : "AI"}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="leading-relaxed text-redup">
              Risiko tiap gedung dihitung mesin simulasi untuk <strong className="text-pasir">{me.school?.name ?? "sekolah umum"}</strong>.
            </p>
            {error && <p role="alert" className="text-bahaya">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-laut px-6 text-lg font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22)] transition-colors hover:bg-laut-terang active:translate-y-px disabled:opacity-60"
            >
              {busy ? "AI menyusun situasi…" : "Mulai gladi"}
            </button>
          </form>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-3xl font-bold text-langit">{CLOCKS[Math.min(steps.length, 3)]}</span>
              <span className="text-redup">{finished ? "Selesai" : `Langkah ${Math.min(steps.length + 1, 4)} dari 4`}</span>
            </div>
            <ol aria-label="Langkah gladi" className="mt-4 grid grid-cols-4 gap-2">
              {STEPS.map(({ short: label }, i) => {
                const s = steps[i];
                const now = !finished && i === steps.length;
                return (
                  <li key={label} aria-current={now ? "step" : undefined} className={now ? "font-semibold" : "text-redup"}>
                    <span className="block h-1.5 rounded-full bg-malam-3">
                      <span
                        className={`block h-full origin-left rounded-full ${s ? `${VERDICT[s.feedback.verdict].bar} motion-safe:animate-grow` : now ? "animate-pulse bg-langit" : ""}`}
                      />
                    </span>
                    <span className="mt-2 block truncate">{label}</span>
                    <span className="sr-only">{s ? VERDICT[s.feedback.verdict].label : now ? "sedang berjalan" : "belum"}</span>
                  </li>
                );
              })}
            </ol>
            <ol className="mt-4">
              {steps.map((s, i) => (
                <Entry key={i} i={i} step={s} />
              ))}
            </ol>

            <div ref={current}>
              {(stage === "aksi" || stage === "susulan") && pending && (
                <Slot i={steps.length}>
                  <div className="motion-safe:animate-rise">
                    <p className="text-lg leading-relaxed">{pending.situation}</p>
                    <p className="mt-2 text-lg font-bold">{pending.question}</p>
                    {answer ? (
                      <>
                        <p className="mt-3 font-semibold">{answer}</p>
                        {busy && (
                          <>
                            <p role="status" className="mt-2 flex items-center gap-2 text-redup">
                              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-langit" />
                              {stage === "susulan" ? "AI menilai dan menulis evaluasi…" : "AI menilai keputusan…"}
                            </p>
                            <span aria-hidden="true" className="mt-3 block space-y-2">
                              <span className="skeleton block h-5 w-full" />
                              <span className="skeleton block h-5 w-2/3" />
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <Choices key={steps.length} inject={pending} busy={busy} onDecide={decide} />
                    )}
                  </div>
                </Slot>
              )}

              {(stage === "gedung" || stage === "kumpul") && (
                <Slot i={steps.length}>
                  <div key={stage} className="motion-safe:animate-rise">
                    <p className="text-lg leading-relaxed">{ask?.situation}</p>
                    <p className="mt-2 text-lg font-bold">{ask?.question}</p>
                    <p className="mt-3 text-redup">Pilih di peta atau di bawah ini.</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(stage === "gedung" ? Object.keys(BUILDINGS) : options.map((t) => t.id)).map((id) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={draft === id}
                          onClick={() => onPick(id)}
                          onPointerEnter={() => setPreview(id)}
                          onPointerLeave={() => setPreview(null)}
                          onFocus={() => setPreview(id)}
                          onBlur={() => setPreview(null)}
                          className="min-h-11 rounded-lg border border-malam-3 bg-malam px-3 py-2 text-left leading-snug transition-colors hover:border-laut aria-pressed:border-langit aria-pressed:bg-langit/10"
                        >
                          <span className="font-semibold">{nameIn(MAP.id, id)}</span>{" "}
                          <span className="whitespace-nowrap text-redup tabular-nums">
                            {stage === "gedung" ? `${occupants(MAP.id, id)} orang` : reach[id]?.route ? `${reach[id].meters} m` : "tak terjangkau"}
                          </span>
                        </button>
                      ))}
                    </div>
                    {draft && (
                      <div ref={confirmBox} className="mt-4 scroll-mb-4 rounded-lg border border-langit/40 bg-malam p-3 motion-safe:animate-rise">
                        <p role="status" className="leading-relaxed">
                          {stage === "gedung"
                            ? `${nameIn(MAP.id, draft)}: ${BUILDINGS[draft].floors} lantai, ${occupants(MAP.id, draft)} orang.`
                            : chosen?.route
                              ? `${chosen.meters} m dari ${short(sweep!)}, sekitar ${Math.round(chosen.meters / 1.5)} detik berjalan${chosen.crossed ? `, melewati ${chosen.crossed} petak bahaya` : ""}.`
                              : `Tidak ada jalan ke ${nameIn(MAP.id, draft)}.`}
                        </p>
                        <button
                          type="button"
                          onClick={confirm}
                          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-laut px-5 font-bold text-white transition-colors hover:bg-laut-terang active:translate-y-px"
                        >
                          {stage === "gedung" ? `Kosongkan ${short(draft)}` : `Arahkan ke ${short(draft)}`}
                        </button>
                      </div>
                    )}
                  </div>
                </Slot>
              )}

              {stage === "lanjut" &&
                (busy ? (
                  <Writing i={3} text="AI menyusun kejadian berikutnya…" />
                ) : (
                  !error && (
                    <div className="border-t border-malam-3 pt-4">
                      <button
                        type="button"
                        onClick={() => live && go && send({ state: live.state, token: live.token, moves: [{ target: sweep }, go.move] })}
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-laut px-6 font-bold text-white hover:bg-laut-terang active:translate-y-px"
                      >
                        Lanjut
                      </button>
                    </div>
                  )
                ))}

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

              {finished && <Debrief a={finished.debrief} saved={finished.saved} steps={finished.steps} />}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// The layout of the table while the account loads, so nothing jumps when it arrives.
function Loading() {
  return (
    <div role="status" aria-label="Memuat gladi" className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
      <div className="space-y-3">
        <span className="flex gap-2">
          {["w-24", "w-36", "w-20"].map((w) => (
            <span key={w} className={`skeleton h-11 ${w}`} />
          ))}
        </span>
        <span className="skeleton block w-full rounded-lg" style={{ aspectRatio: `${W} / ${H}` }} />
      </div>
      <span className="skeleton block h-[34rem] rounded-lg" />
    </div>
  );
}

export default function Gladi({ quake }: { quake: Quake | null }) {
  return <RequireAuth loading={<Loading />}>{(me) => <Table me={me} quake={quake} />}</RequireAuth>;
}

"use client";

import { Activity, ArrowRight, CloudLightning, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import CountUp from "@/components/CountUp";
import { HAZARD_ICON } from "@/components/hazards";
import { ago, useNow } from "@/components/useNow";
import { useReducedMotion } from "@/components/useReducedMotion";
import type { QuakeEvent, Warning } from "@/lib/bmkgFeed";
import { num } from "@/lib/format";
import type { Hazard } from "@/lib/gladi";
import { MAP_H, MAP_W, project } from "@/lib/nusantara";
import { seismogram } from "./Instrument";
import { LEARN_EVENT } from "./Lessons";

// BMKG's depth classes: shallow quakes do the most damage at the surface.
export const DEPTH = [
  { max: 60, label: "Dangkal", color: "#ff6b6b" },
  { max: 300, label: "Menengah", color: "#f0b429" },
  { max: Infinity, label: "Dalam", color: "#22ccee" },
];
export const depthOf = (km: number) => DEPTH.find((d) => km < d.max)!;
const RAIN = "#3d7bf5";
const REPLAY_S = 7;
const radius = (m: number) => 1.5 + Math.max(0, m - 2) * 1.1;
const DAY = 86_400_000;
const dateWib = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const LEARN: Record<Hazard, string> = { gempa: "Gempa", banjir: "Banjir", angin: "Angin", longsor: "Longsor" };

// A cross-section under the epicentre: the hypocentre at its depth (square-root scale, so shallow quakes stay apart)
// with waves spreading through the crust.
function CrossSection({ depthKm, color }: { depthKm: number; color: string }) {
  const at = (km: number) => 18 + Math.sqrt(Math.min(km, 700) / 700) * 84;
  const y = at(depthKm);
  return (
    <svg viewBox="0 0 300 108" aria-hidden="true" className="block h-auto w-full">
      <defs>
        <clipPath id="kerak">
          <rect y={18} width={300} height={90} />
        </clipPath>
      </defs>
      <rect y={18} width={300} height={90} fill="#0b1e3f" />
      {[60, 300].map((km) => (
        <g key={km}>
          <line x1={0} x2={300} y1={at(km)} y2={at(km)} stroke="#1b3461" strokeDasharray="3 4" />
          <text x={4} y={at(km) - 3} fontSize={9} fill="#a6b9de" className="font-mono">
            {km} km
          </text>
        </g>
      ))}
      <g clipPath="url(#kerak)">
        {[0, 1, 2].map((k) => (
          <circle
            key={k}
            cx={150}
            cy={y}
            r={90}
            fill="none"
            stroke={color}
            vectorEffect="non-scaling-stroke"
            className="motion-safe:animate-wave motion-reduce:opacity-30 [transform-box:fill-box] [transform-origin:center]"
            style={{ animationDelay: `${k}s` }}
          />
        ))}
      </g>
      <line x1={0} x2={300} y1={18} y2={18} stroke="#a6b9de" strokeWidth={1.5} />
      <path d="M142 18v-8l8-6 8 6v8z" fill="#afc4ec" />
      <line x1={150} x2={150} y1={18} y2={y} stroke={color} strokeDasharray="3 3" />
      <circle cx={150} cy={y} r={4.5} fill={color} stroke="#071530" strokeWidth={1.5} />
      <text x={160} y={y + 4} fontSize={11} fontWeight={700} fill="#eaf1ff" className="font-mono">
        {depthKm} km
      </text>
    </svg>
  );
}

// The live monitor: BMKG's recent quakes and today's severe weather warnings on one map. Scrolling it into view replays
// the quakes in the order they struck, along a timeline compressed towards the past so the latest days get room.
export default function LiveBoard({ land, quakes, warnings }: { land: string; quakes: QuakeEvent[]; warnings: Warning[] }) {
  const now = useNow();
  const reduced = useReducedMotion();
  const [sel, setSel] = useState(0);
  const [selW, setSelW] = useState<number | null>(null);
  const [hover, setHover] = useState<{ q: number } | { w: number } | null>(null);
  const [show, setShow] = useState({ gempa: true, cuaca: true });
  // 0 until the board first scrolls into view; each replay remounts the markers to restart their animations.
  const [run, setRun] = useState(0);
  const [settled, setSettled] = useState(true);
  const figRef = useRef<HTMLElement>(null);

  const play = () => {
    setRun((r) => r + 1);
    setSettled(false);
  };
  useEffect(() => {
    const el = figRef.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setRun(1);
        setSettled(false);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (settled) return;
    const t = setTimeout(() => setSettled(true), REPLAY_S * 1000 + 300);
    return () => clearTimeout(t);
  }, [settled, run]);

  const end = quakes[0]?.at ?? 0;
  const span = Math.max(1, end - (quakes.at(-1)?.at ?? end));
  const pos = (at: number) => 0.03 + 0.94 * (1 - Math.sqrt((end - at) / span));
  const ticks = [0, 1, 3, 7, 14, 21, 28].map((d) => d * DAY).filter((d) => d <= span);

  // Warnings past their expiry drop out once the browser knows the time; the prerendered page shows the whole feed.
  const active = useMemo(() => warnings.map((w, i) => ({ w, i })).filter(({ w }) => !now || w.untilMs > now), [warnings, now]);
  const cellPaths = useMemo(
    () =>
      warnings.map((w) =>
        w.cells
          .map(([cx, cy]) => {
            const [x, y] = project(cx / 5, cy / 5);
            return `M${x - 1} ${y - 1}h2v2h-2z`;
          })
          .join(""),
      ),
    [warnings],
  );

  const q = quakes[sel];
  const depth = q && depthOf(q.depthKm);
  const hoverQ = hover && "q" in hover ? hover.q : null;
  const hoverW = hover && "w" in hover ? hover.w : null;
  const trace = useMemo(() => q && seismogram(Math.min(70, Math.max(6, (q.magnitude - 1.5) * 12)), (q.at / 1000) % 7), [q]);
  const learn = (h: Hazard) => {
    dispatchEvent(new CustomEvent(LEARN_EVENT, { detail: h }));
    document.getElementById("pelajari")?.scrollIntoView();
  };
  const card = "track flex flex-col rounded-lg border border-malam-3 bg-malam-2 p-5 shadow-edge sm:p-6";
  const listBtn =
    "flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors duration-200 hover:bg-malam-3/60 aria-pressed:bg-laut/25";

  return (
    <div className="mt-14 space-y-5">
      <figure ref={figRef} className="track overflow-hidden rounded-lg border border-malam-3 bg-malam-2 shadow-edge">
        {trace && (
          <svg
            viewBox="0 30 400 140"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="block h-14 w-full border-b border-malam-3 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] sm:h-20"
          >
            <path
              key={sel}
              d={trace}
              vectorEffect="non-scaling-stroke"
              fill="none"
              stroke={depth.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              className="motion-safe:animate-scroll"
            />
          </svg>
        )}
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          role="img"
          aria-label={`Peta Indonesia: ${quakes.length} gempa terakhir dan ${active.length} peringatan cuaca ekstrem dari BMKG`}
          className="block h-auto w-full"
        >
          <defs>
            <linearGradient id="bmkg-sweep">
              <stop offset={0} stopColor="#22ccee" stopOpacity={0} />
              <stop offset={1} stopColor="#22ccee" stopOpacity={0.12} />
            </linearGradient>
          </defs>
          {[95, 100, 105, 110, 115, 120, 125, 130, 135, 140].map((lon) => (
            <line key={lon} x1={(lon - 94.5) * 10} x2={(lon - 94.5) * 10} y1={0} y2={MAP_H} stroke="#22ccee" strokeOpacity={0.07} />
          ))}
          {[5, 0, -5, -10].map((lat) => (
            <line key={lat} x1={0} x2={MAP_W} y1={(6.5 - lat) * 10} y2={(6.5 - lat) * 10} stroke="#22ccee" strokeOpacity={lat ? 0.07 : 0.18} />
          ))}
          <path d={land} fill="#1b3461" />

          {show.cuaca && (
            <g key={run} className={run ? "motion-safe:animate-[rise_1s_var(--ease-crisp)_6s_both]" : ""}>
              {active.map(({ i }, k) => {
                const lit = selW === i || hoverW === i;
                return (
                  <path
                    key={i}
                    d={cellPaths[i]}
                    fill={lit ? "#eaf1ff" : RAIN}
                    className={lit ? "" : "motion-safe:animate-pulse"}
                    style={{ animationDelay: `${(k % 7) * 0.3}s` }}
                    onPointerEnter={() => setHover({ w: i })}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => setSelW(i)}
                  />
                );
              })}
            </g>
          )}

          {show.gempa && (
            // Oldest first, so the newest quakes draw on top.
            <g key={run}>
              {quakes
                .map((e, i) => ({ e, i }))
                .reverse()
                .map(({ e, i }) => {
                  const [x, y] = project(e.lon, e.lat);
                  const d = depthOf(e.depthKm);
                  const r = radius(e.magnitude);
                  const lit = i === sel || i === hoverQ;
                  const delay: CSSProperties = { animationDelay: `${pos(e.at) * REPLAY_S}s` };
                  const pop = "[transform-box:fill-box] [transform-origin:center]";
                  return (
                    <g
                      key={e.at}
                      transform={`translate(${x} ${y})`}
                      className="cursor-pointer"
                      onPointerEnter={() => setHover({ q: i })}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => setSel(i)}
                    >
                      {run > 0 && <circle r={r} fill="none" stroke={d.color} strokeWidth={0.6} className={`opacity-0 motion-safe:animate-ripple ${pop}`} style={delay} />}
                      <circle
                        r={r}
                        fill={d.color}
                        fillOpacity={lit ? 0.75 : 0.3}
                        stroke={lit ? "#eaf1ff" : d.color}
                        strokeWidth={lit ? 0.9 : 0.5}
                        className={run ? `motion-safe:animate-pop ${pop}` : ""}
                        style={delay}
                      />
                    </g>
                  );
                })}
            </g>
          )}

          {q && show.gempa && settled && (
            <g transform={`translate(${project(q.lon, q.lat).join(" ")})`} pointerEvents="none">
              <line x1={-MAP_W} x2={MAP_W} stroke="#eaf1ff" strokeOpacity={0.22} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
              <line y1={-MAP_H} y2={MAP_H} stroke="#eaf1ff" strokeOpacity={0.22} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
              {!reduced &&
                [0, 1, 2].map((k) => (
                  <circle
                    key={`${sel}-${k}`}
                    r={10 * 1.6 ** (q.magnitude - 4)}
                    fill="none"
                    stroke={depth.color}
                    strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                    className="animate-wave [transform-box:fill-box] [transform-origin:center]"
                    style={{ animationDelay: `${k}s` }}
                  />
                ))}
              <text
                x={radius(q.magnitude) + 3}
                y={-radius(q.magnitude) - 2}
                fontSize={9}
                fontWeight={800}
                fill="#eaf1ff"
                stroke="#071530"
                strokeWidth={2.5}
                paintOrder="stroke"
                className="font-mono"
              >
                M{num(q.magnitude, 1)}
              </text>
            </g>
          )}
          <rect width={MAP_W * 0.12} height={MAP_H} fill="url(#bmkg-sweep)" pointerEvents="none" className="motion-safe:animate-sweep motion-reduce:hidden [transform-box:view-box]" />
        </svg>

        <div className="flex items-start gap-3 border-t border-malam-3 px-3 pt-3 sm:px-4">
          <button
            type="button"
            onClick={play}
            disabled={!quakes.length}
            aria-label="Putar ulang urutan gempa"
            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-malam-3 text-redup transition-colors hover:border-redup hover:text-pasir"
          >
            <RotateCcw aria-hidden="true" className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <svg viewBox={`0 0 ${MAP_W} 30`} preserveAspectRatio="none" aria-hidden="true" className="block h-9 w-full">
              <line x1={0} x2={MAP_W} y1={29.5} y2={29.5} stroke="#1b3461" vectorEffect="non-scaling-stroke" />
              {quakes.map((e, i) => {
                const x = pos(e.at) * MAP_W;
                const lit = i === sel || i === hoverQ;
                return (
                  <line
                    key={e.at}
                    x1={x}
                    x2={x}
                    y1={29.5}
                    y2={29.5 - Math.max(2, (e.magnitude - 1.5) * 4.6)}
                    stroke={lit ? "#eaf1ff" : depthOf(e.depthKm).color}
                    strokeWidth={lit ? 3 : 2}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {run > 0 && (
                <line
                  key={run}
                  y1={0}
                  y2={30}
                  stroke="#eaf1ff"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  className="opacity-0 motion-safe:animate-playhead [transform-box:view-box]"
                />
              )}
            </svg>
            <div aria-hidden="true" className="relative h-7 font-mono text-sm text-redup">
              {ticks.map((d, i) => {
                const x = pos(end - d);
                return (
                  <span
                    key={d}
                    className={`absolute top-1 whitespace-nowrap ${x > 0.9 ? "-translate-x-full" : x < 0.1 ? "" : "-translate-x-1/2"} ${i % 2 ? "max-sm:hidden" : ""}`}
                    style={{ left: `${x * 100}%` }}
                  >
                    {dateWib(end - d)}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-malam-3 px-4 py-3">
          {DEPTH.map((d) => (
            <span key={d.label} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-full border" style={{ background: `${d.color}55`, borderColor: d.color }} />
              {d.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-[2px]" style={{ background: RAIN }} />
            Hujan lebat
          </span>
          <span className="flex gap-2 sm:ml-auto">
            {(["gempa", "cuaca"] as const).map((k) => (
              <label
                key={k}
                className="flex min-h-10 items-center gap-2 rounded-md border border-malam-3 px-3 font-semibold text-redup transition-colors has-checked:border-laut has-checked:text-pasir has-focus-visible:outline-2 has-focus-visible:outline-langit"
              >
                <input type="checkbox" className="accent-laut" checked={show[k]} onChange={() => setShow({ ...show, [k]: !show[k] })} />
                {k === "gempa" ? "Gempa" : "Cuaca"}
              </label>
            ))}
          </span>
        </figcaption>
      </figure>

      <div className="grid gap-5 lg:grid-cols-3">
        <article aria-labelledby="gempa-pilih" className={card}>
          {q ? (
            <>
              <h3 id="gempa-pilih" aria-live="polite" className="text-2xl leading-snug font-extrabold tracking-tight">
                <span className="font-mono" style={{ color: depth.color }}>
                  M<CountUp key={sel} value={q.magnitude} digits={1} ms={700} />
                </span>{" "}
                {q.place}.
              </h3>
              <div className="mt-5 overflow-hidden rounded-md border border-malam-3">
                <CrossSection key={sel} depthKm={q.depthKm} color={depth.color} />
              </div>
              <dl className="mt-4 mb-6">
                {[
                  ["Waktu", ago(q.at, now) ?? q.time],
                  ["Kedalaman", `${num(q.depthKm)} km, ${depth.label.toLowerCase()}`],
                  ["Dirasakan", q.felt ?? "Tidak tercatat"],
                  ["Tsunami", q.potential || "Tidak tercatat"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-malam-3 py-2.5 last:border-0">
                    <dt className="text-redup">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <Link
                href="/gladi"
                className="group mt-auto flex min-h-12 items-center gap-3 rounded-md border border-malam-3 bg-malam px-4 font-semibold transition-colors duration-300 ease-crisp hover:border-laut"
              >
                <span className="flex-1">Gladi ruang dari gempa terkini</span>
                <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </>
          ) : (
            <h3 id="gempa-pilih" className="text-2xl font-extrabold">
              Data gempa BMKG sedang tidak bisa dimuat.
            </h3>
          )}
        </article>

        <article aria-labelledby="gempa-daftar" className={card}>
          <h3 id="gempa-daftar" className="text-2xl font-extrabold tracking-tight">
            {quakes.length} gempa terakhir
          </h3>
          <ol className="-mx-2 mt-4 max-h-[24rem] flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {quakes.map((e, i) => (
              <li key={e.at}>
                <button
                  type="button"
                  aria-pressed={i === sel}
                  onClick={() => setSel(i)}
                  onPointerEnter={() => setHover({ q: i })}
                  onPointerLeave={() => setHover(null)}
                  className={listBtn}
                >
                  <span className="w-9 shrink-0 font-mono font-bold" style={{ color: depthOf(e.depthKm).color }}>
                    {num(e.magnitude, 1)}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{e.place}</span>
                  <span className="shrink-0 text-redup tabular-nums">{ago(e.at, now)?.replace(" lalu", "") ?? dateWib(e.at)}</span>
                </button>
              </li>
            ))}
          </ol>
        </article>

        <article aria-labelledby="cuaca-daftar" className={card}>
          <h3 id="cuaca-daftar" className="text-2xl font-extrabold tracking-tight">
            {active.length} peringatan cuaca ekstrem
          </h3>
          {active.length ? (
            <ol className="-mx-2 mt-4 max-h-[19rem] flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {active.map(({ w, i }) => (
                <li key={i}>
                  <button
                    type="button"
                    aria-pressed={selW === i}
                    onClick={() => setSelW(selW === i ? null : i)}
                    onPointerEnter={() => setHover({ w: i })}
                    onPointerLeave={() => setHover(null)}
                    className={listBtn}
                  >
                    <CloudLightning aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-laut-terang" />
                    <span className="min-w-0 flex-1 leading-snug">
                      <strong>{w.area}</strong>{" "}
                      <span className="text-redup">
                        {w.districts ? `${w.districts} kecamatan, ` : ""}hingga {w.until}
                      </span>
                    </span>
                  </button>
                  {selW === i && (
                    <div className="animate-rise space-y-3 px-2 pt-1 pb-3">
                      <p className="leading-relaxed text-redup">{w.headline}.</p>
                      {w.hazards.length > 0 && (
                        <p className="flex flex-wrap gap-2">
                          {w.hazards.map((h) => {
                            const Icon = HAZARD_ICON[h];
                            return (
                              <button
                                key={h}
                                type="button"
                                onClick={() => learn(h)}
                                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-malam-3 px-3 font-semibold transition-colors hover:border-laut"
                              >
                                <Icon aria-hidden="true" className="size-4 text-langit" />
                                Langkah saat {LEARN[h].toLowerCase()}
                              </button>
                            );
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-redup">Tidak ada peringatan yang masih berlaku.</p>
          )}
          <p className="mt-auto flex items-center gap-2 border-t border-malam-3 pt-4 text-redup">
            <Activity aria-hidden="true" className="size-4 shrink-0 text-langit" />
            Data BMKG: gempa terkini, gempa dirasakan, dan peringatan dini cuaca.
          </p>
        </article>
      </div>
    </div>
  );
}

"use client";

import { ArrowRight, Pause, Play } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { MAPS, type Setting } from "@/lib/maps";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const mq = matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

const CAMPUSES: { id: Setting; hazard: string }[] = [
  { id: "pesisir", hazard: "banjir rob" },
  { id: "pegunungan", hazard: "longsor" },
  { id: "kota", hazard: "gempa" },
];

const TILE_FILL: Record<string, string> = { b: "#afc4ec", h: "#1d5a6e", g: "#174a5c", t: "#2b8a74" };
const tileClass = (c: string) => (/\d/.test(c) ? "b" : c === "T" ? "t" : c === "h" || c === "g" ? c : null);

// The campus's real site plan, one rect per run of same-kind tiles so it stays a few hundred nodes.
function SitePlan({ id }: { id: Setting }) {
  const grid = MAPS[id]!.grid;
  const runs = grid.flatMap((row, z) => {
    const out: { x: number; z: number; w: number; k: string }[] = [];
    for (let x = 0; x < row.length; ) {
      const k = tileClass(row[x]);
      let w = 1;
      while (x + w < row.length && tileClass(row[x + w]) === k) w++;
      if (k) out.push({ x, z, w, k });
      x += w;
    }
    return out;
  });
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${grid[0].length} ${grid.length}`} className="h-auto w-16 shrink-0 rounded-sm bg-malam-2 xl:w-20">
      {runs.map((r) => (
        <rect key={`${r.x}-${r.z}`} x={r.x} y={r.z} width={r.w + 0.02} height={1.02} fill={TILE_FILL[r.k]} />
      ))}
    </svg>
  );
}

export default function Hero() {
  const reduced = useSyncExternalStore(subscribe, () => matchMedia(REDUCED).matches, () => false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const paused = choice ?? reduced;
  const levelRef = useRef<HTMLSpanElement>(null);
  // Written straight to the DOM: the scene reports every frame and a re-render per frame would be waste.
  const onLevel = useCallback((m: number) => {
    if (levelRef.current) levelRef.current.textContent = `${m.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
  }, []);

  return (
    // The gradient matches the dawn sky, so nothing flashes while the 3D chunk loads.
    <section className="relative isolate flex h-[100svh] min-h-[640px] flex-col overflow-hidden bg-[linear-gradient(180deg,#1d2c4b_0%,#4a4a66_55%,#b86f50_100%)]">
      <div className="parallax-back absolute inset-0 -z-10">
        <HeroScene paused={paused} startAt={6} onLevel={onLevel} />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-[linear-gradient(180deg,rgb(7_21_48/0.7),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[70%] bg-[linear-gradient(0deg,#071530_15%,rgb(7_21_48/0.8)_45%,transparent)] lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[62%] lg:bg-[linear-gradient(90deg,#071530_0%,rgb(7_21_48/0.86)_40%,rgb(7_21_48/0.4)_70%,transparent)]"
      />
      <div className="absolute top-16 right-4 flex items-center gap-2 sm:right-6">
        <p
          aria-hidden="true"
          className="hidden min-h-11 items-center gap-2 rounded-md border border-pasir/20 bg-malam/70 px-3 text-sm text-pasir/90 md:flex"
        >
          <span className={`size-2 rounded-full bg-langit ${paused ? "" : "animate-pulse"}`} />
          Simulasi banjir · air <span ref={levelRef} className="min-w-[3.5ch] font-bold tabular-nums">0,0 m</span>
        </p>
        <button
          type="button"
          onClick={() => setChoice(!paused)}
          aria-label={paused ? "Putar animasi" : "Jeda animasi"}
          className="flex size-11 items-center justify-center rounded-md border border-pasir/20 bg-malam/70 text-pasir hover:border-pasir"
        >
          {paused ? <Play aria-hidden="true" className="size-5" /> : <Pause aria-hidden="true" className="size-5" />}
        </button>
      </div>
      <div className="parallax-fore mx-auto flex w-full max-w-6xl flex-1 items-end px-4 pb-10 sm:px-6 lg:items-center lg:pb-0">
        <h1 className="max-w-[11ch] animate-rise text-5xl font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-7xl lg:text-[5.75rem]">
          Hafal jalan selamat <span className="text-fajar">sebelum</span> bencana datang.
        </h1>
      </div>
      <nav aria-label="Pilih sekolah latihan" className="animate-rise border-t border-pasir/15 bg-malam/90 [animation-delay:200ms]">
        <ul className="mx-auto grid max-w-6xl divide-y divide-pasir/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0 lg:border-x lg:border-pasir/10">
          {CAMPUSES.map(({ id, hazard }) => (
            <li key={id}>
              <Link
                href={`/sekolah?peta=${id}`}
                className="group flex min-h-18 items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-laut focus-visible:bg-laut sm:px-6 lg:px-5 lg:py-5"
              >
                <SitePlan id={id} />
                <span className="flex-1 text-xl leading-tight font-bold">
                  {MAPS[id]!.name} <span className="font-medium text-redup group-hover:text-pasir/85">{hazard}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-6 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

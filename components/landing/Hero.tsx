"use client";

import { ArrowRight, Pause, Play } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import SitePlan, { CAMPUSES } from "@/components/SitePlan";
import { MAPS } from "@/lib/maps";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const mq = matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

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
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-linear-to-b from-malam/70 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[70%] bg-linear-to-t from-malam from-15% via-malam/80 via-45% to-transparent lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[62%] lg:bg-linear-to-r lg:from-0% lg:via-malam/85 lg:via-40%"
      />
      <div className="absolute top-16 right-4 flex animate-rise items-center gap-2 [animation-delay:450ms] sm:right-6">
        <p
          aria-hidden="true"
          className="hidden min-h-11 items-center gap-2 rounded-md border border-pasir/20 bg-malam/70 px-3 text-sm text-pasir/90 md:flex"
        >
          <span className={`size-2 rounded-full bg-langit ${paused ? "" : "animate-pulse"}`} />
          Simulasi banjir · air <span ref={levelRef} className="min-w-[5ch] font-mono font-semibold">0,0 m</span>
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
      <nav aria-label="Pilih sekolah latihan" className="border-t border-pasir/15 bg-malam/90">
        <ul className="mx-auto grid max-w-6xl divide-y divide-pasir/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0 lg:border-x lg:border-pasir/10">
          {CAMPUSES.map(({ id, hazard }, i) => (
            <li key={id} className="animate-rise" style={{ animationDelay: `${200 + i * 90}ms` }}>
              <Link
                href={`/sekolah?peta=${id}`}
                className="group flex min-h-18 items-center gap-4 px-4 py-3 transition-colors duration-300 ease-crisp hover:bg-laut hover:text-white focus-visible:bg-laut focus-visible:text-white sm:px-6 lg:px-5 lg:py-5"
              >
                <SitePlan id={id} className="h-auto w-16 shrink-0 rounded-sm bg-peta xl:w-20" />
                <span className="flex-1 text-xl leading-tight font-bold">
                  {MAPS[id]!.name} <span className="font-medium text-redup group-hover:text-white/85 group-focus-visible:text-white/85">{hazard}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-6 shrink-0 transition-transform duration-300 ease-crisp group-hover:translate-x-1.5" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

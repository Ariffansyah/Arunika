"use client";

import { ArrowDown, ArrowRight, Pause, Play } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";

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
    <section className="relative isolate flex h-[100svh] min-h-[600px] items-end overflow-hidden bg-[linear-gradient(180deg,#1d2c4b_0%,#4a4a66_55%,#b86f50_100%)] lg:items-center">
      <div className="parallax-back absolute inset-0 -z-10">
        <HeroScene paused={paused} startAt={6} onLevel={onLevel} />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-[linear-gradient(180deg,rgb(13_24_40/0.7),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[62%] bg-[linear-gradient(0deg,#0d1828_10%,rgb(13_24_40/0.8)_45%,transparent)] lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[62%] lg:bg-[linear-gradient(90deg,#0d1828_0%,rgb(13_24_40/0.86)_40%,rgb(13_24_40/0.4)_70%,transparent)]"
      />
      <div className="parallax-fore mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24 lg:pb-0">
        <h1 className="max-w-[11ch] animate-rise text-5xl font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-7xl lg:text-[5.75rem]">
          Hafal jalan selamat <span className="text-fajar">sebelum</span> bencana datang.
        </h1>
        <p className="mt-5 max-w-[34rem] animate-rise text-lg leading-relaxed text-pasir/85 [animation-delay:120ms] sm:text-xl">
          Masuk ke kampus 3D, hadapi banjir atau gempa, dan temukan rute tercepat ke titik kumpul bersama teman sekelas.
        </p>
        <div className="mt-9 flex animate-rise flex-wrap items-center gap-3 [animation-delay:240ms]">
          <Link
            href="/kampus"
            className="group inline-flex min-h-14 items-center gap-2 rounded-md bg-fajar px-7 text-lg font-bold text-malam shadow-[0_10px_40px_-8px_rgb(255_138_61/0.65)] hover:bg-fajar-tua active:translate-y-px"
          >
            Mulai latihan
            <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-14 items-center rounded-md border border-pasir/40 bg-malam/40 px-6 font-semibold text-pasir backdrop-blur-sm hover:border-pasir active:translate-y-px"
          >
            Lihat dasbor
          </Link>
          <a
            href="#coba"
            className="inline-flex min-h-11 items-center gap-1.5 px-2 font-semibold text-pasir/80 underline-offset-4 hover:text-pasir hover:underline"
          >
            Coba rute di halaman ini
            <ArrowDown aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>
      <p
        aria-hidden="true"
        className="absolute top-16 right-4 hidden items-center gap-2 rounded-md border border-pasir/20 bg-malam/60 px-3 py-2 text-sm text-pasir/90 backdrop-blur-sm sm:right-6 md:flex"
      >
        <span className={`size-2 rounded-full bg-bahaya ${paused ? "" : "animate-pulse"}`} />
        Simulasi banjir · air <span ref={levelRef} className="min-w-[3.5ch] font-bold tabular-nums">0,0 m</span>
      </p>
      <button
        type="button"
        onClick={() => setChoice(!paused)}
        aria-label={paused ? "Putar animasi" : "Jeda animasi"}
        className="absolute right-4 bottom-4 flex size-11 items-center justify-center rounded-md border border-pasir/30 bg-malam/60 text-pasir hover:border-pasir sm:right-6 sm:bottom-6"
      >
        {paused ? <Play aria-hidden="true" className="size-5" /> : <Pause aria-hidden="true" className="size-5" />}
      </button>
    </section>
  );
}

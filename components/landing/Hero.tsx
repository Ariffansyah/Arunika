"use client";

import { Pause, Play } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

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

  return (
    // The gradient matches the dawn sky, so nothing flashes while the 3D chunk loads.
    <section className="relative isolate flex h-[100svh] min-h-[600px] items-end overflow-hidden bg-[linear-gradient(180deg,#1d2c4b_0%,#4a4a66_55%,#b86f50_100%)] lg:items-center">
      <div className="absolute inset-0 -z-10">
        <HeroScene paused={paused} startAt={6} />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-[linear-gradient(180deg,rgb(13_24_40/0.7),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[62%] bg-[linear-gradient(0deg,#0d1828_10%,rgb(13_24_40/0.8)_45%,transparent)] lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[62%] lg:bg-[linear-gradient(90deg,#0d1828_0%,rgb(13_24_40/0.86)_40%,rgb(13_24_40/0.4)_70%,transparent)]"
      />
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20 lg:pb-0">
        <h1 className="max-w-[11ch] text-5xl font-extrabold leading-[1] tracking-[-0.035em] sm:text-7xl lg:text-[5.25rem]">
          Latihan evakuasi <span className="text-fajar">sebelum</span> bencana datang.
        </h1>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/kampus"
            className="inline-flex min-h-12 items-center rounded-md bg-fajar px-6 font-semibold text-malam hover:bg-fajar-tua active:translate-y-px"
          >
            Masuk kampus
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-12 items-center rounded-md border border-pasir/40 bg-malam/40 px-6 font-semibold text-pasir hover:border-pasir active:translate-y-px"
          >
            Lihat dasbor
          </Link>
        </div>
      </div>
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

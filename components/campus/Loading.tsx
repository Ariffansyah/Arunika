"use client";

import { useEffect, useState } from "react";
import SitePlan from "@/components/SitePlan";
import { LESSONS } from "@/lib/lessons";
import { MAPS, type Setting } from "@/lib/maps";
import { useDrill } from "./drillStore";

// The school's plan fills in as the models arrive, with a step from the lessons to read while waiting.
export default function Loading({ id, ready = false }: { id: Setting; ready?: boolean }) {
  const map = MAPS[id]!;
  const files = useDrill((s) => s.loaded);
  const steps = map.disasters.flatMap((k) => LESSONS[k].steps);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (ready) return;
    const t = setInterval(() => setTip((i) => i + 1), 6000);
    return () => clearInterval(t);
  }, [ready]);
  const step = steps[tip % steps.length];
  // Downloads are most of the wait; the last stretch is the scene being built and its shaders compiled.
  const pct = ready ? 100 : Math.round(files * 90);
  const label = `${files < 1 ? "Memuat" : "Menyiapkan"} ${map.name}`;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-malam p-6 transition-[opacity,visibility] duration-500 ${ready ? "invisible opacity-0" : ""}`}
    >
      <div className="w-full max-w-lg space-y-6">
        <div className="relative overflow-hidden rounded-lg bg-malam-2">
          <SitePlan id={id} className="block h-auto w-full opacity-20" />
          <div className="absolute inset-0 transition-[clip-path] duration-500" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
            <SitePlan id={id} className="block h-auto w-full" />
          </div>
        </div>
        <div>
          <div className="flex justify-between gap-4 font-semibold">
            <span>{label}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={label}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-malam-3"
          >
            {/* A transform, not a width: it keeps moving while the main thread decodes models. */}
            <div className="h-full origin-left bg-langit transition-transform duration-500" style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
        </div>
        <p key={tip} className="min-h-[4lh] animate-rise leading-relaxed">
          <strong>{step.title}</strong> <span className="text-redup">{step.why}</span>
        </p>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import CampusPlan from "@/components/CampusPlan";
import { predict } from "@/components/campus/drillStore";
import { ASSEMBLY_NAMES, GRID, SPAWN, tileAt } from "@/lib/campus";
import { INTENSITY, SCENARIO_LABEL, bestRoute, pathLength, type Scenario } from "@/lib/sim";

const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const HAZARD_COLOR = { banjir: "#3b82c4", gempa: "#e0473c" };
const never = () => () => {};
const thisYear = () => new Date().getFullYear();

export default function PlanDemo() {
  const [scenario, setScenario] = useState<Scenario>({ kind: "banjir", intensity: 1 });
  // Prerendering may not read the clock. The year only sets building age, which the default flood view ignores,
  // so the server renders with 0 and the browser switches to the real year after hydration.
  const year = useSyncExternalStore(never, thisYear, () => 0);
  const { hazards, route } = useMemo(() => {
    const p = predict(scenario, null, year);
    return { hazards: p.hazards, route: bestRoute(GRID, SPAWN, p.goals, p.hazards) };
  }, [scenario, year]);
  const meta = INTENSITY[scenario.kind];
  const end = route?.at(-1);

  return (
    <section aria-labelledby="coba" className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-14 lg:py-28">
      <div className="space-y-8">
        <h2 id="coba" className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
          Geser, lihat jalurnya berubah.
        </h2>
        <fieldset>
          <legend className="sr-only">Skenario</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["banjir", "gempa"] as const).map((k) => (
              <label
                key={k}
                className="flex min-h-12 items-center justify-center rounded-md border border-malam-3 px-3 font-semibold hover:border-redup has-checked:border-fajar has-checked:bg-fajar has-checked:text-malam has-focus-visible:outline-2 has-focus-visible:outline-fajar"
              >
                <input
                  type="radio"
                  name="demo-kind"
                  className="sr-only"
                  checked={scenario.kind === k}
                  onChange={() => setScenario({ kind: k, intensity: k === "gempa" ? 6.5 : 1 })}
                />
                {SCENARIO_LABEL[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="demo-intensity" className="block text-lg font-semibold">
          {`${meta.label} ${fmt(scenario.intensity)} ${meta.unit}`.trim()}
          <input
            id="demo-intensity"
            type="range"
            min={meta.range[0]}
            max={meta.range[1]}
            step={meta.step}
            value={scenario.intensity}
            onChange={(e) => setScenario({ ...scenario, intensity: Number(e.target.value) })}
            className="mt-3 block w-full accent-fajar"
          />
        </label>
        <p role="status" className="text-lg leading-relaxed text-redup">
          {end ? (
            <>
              Jalur aman ke <strong className="text-pasir">{ASSEMBLY_NAMES[tileAt(...end)]}</strong>,{" "}
              {Math.round(pathLength(route!))} petak. {hazards.size} petak{" "}
              {scenario.kind === "banjir" ? "tergenang" : "rawan reruntuhan"}.
            </>
          ) : (
            <strong className="text-bahaya">Tidak ada titik kumpul yang aman. Naik ke lantai 2.</strong>
          )}
        </p>
      </div>
      <figure className="self-start overflow-hidden rounded-lg border border-malam-3">
        <CampusPlan
          route={route ?? undefined}
          hazards={hazards}
          hazardColor={HAZARD_COLOR[scenario.kind]}
          label={`Denah kampus, ${SCENARIO_LABEL[scenario.kind]} ${fmt(scenario.intensity)} ${meta.unit}`.trim() + ", dengan jalur evakuasi"}
        />
        <figcaption className="flex flex-wrap gap-x-5 gap-y-1 border-t border-malam-3 bg-malam-2 px-3 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="28" height="6" viewBox="0 0 28 6">
              <line x1="2" y1="3" x2="26" y2="3" stroke="#ff8a3d" strokeWidth="4" strokeDasharray="6 4" strokeLinecap="round" />
            </svg>
            Jalur evakuasi
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-3.5 rounded-sm" style={{ background: HAZARD_COLOR[scenario.kind] }} />
            {scenario.kind === "banjir" ? "Tergenang" : "Rawan reruntuhan"}
          </span>
          <span className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="5" fill="none" stroke="#34c47c" strokeWidth="2.5" />
            </svg>
            Titik kumpul
          </span>
        </figcaption>
      </figure>
    </section>
  );
}

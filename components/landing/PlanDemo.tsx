"use client";

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import CampusPlan, { Walker } from "@/components/CampusPlan";
import { predict } from "@/components/campus/drillStore";
import { ASSEMBLY_NAMES, GRID, SPAWN, tileAt } from "@/lib/campus";
import { num } from "@/lib/format";
import { INTENSITY, SCENARIO_LABEL, bestRoute, pathLength, type Scenario } from "@/lib/sim";
import { Portal } from "./Droste";

const HAZARD_COLOR = { banjir: "#22ccee", gempa: "#ff6b6b" };
const never = () => () => {};
const thisYear = () => new Date().getFullYear();

export default function PlanDemo() {
  // The plan demo shows the two hazards that change the map: flood water and quake debris.
  const [scenario, setScenario] = useState<Scenario & { kind: "banjir" | "gempa" }>({ kind: "banjir", intensity: 1 });
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
    // A faint survey grid: this section is the site plan the drill is played on.
    <section
      aria-labelledby="coba"
      className="grain survey border-y border-malam-3 bg-malam-2"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,25rem)_1fr] lg:gap-16 lg:py-28">
        <div className="flex flex-col gap-8">
          <h2 id="coba" className="text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Geser, lihat jalurnya berubah.
          </h2>
          <fieldset>
            <legend className="sr-only">Skenario</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-malam-3 bg-malam p-1 shadow-edge">
              {(["banjir", "gempa"] as const).map((k) => (
                <label
                  key={k}
                  className="flex min-h-12 items-center justify-center rounded-md px-3 font-semibold text-redup transition-colors duration-300 ease-crisp hover:bg-malam-3/50 hover:text-pasir has-checked:bg-laut has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-langit"
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
            {meta.label} <span className="font-mono text-langit">{`${num(scenario.intensity, 1)} ${meta.unit}`.trim()}</span>
            <input
              id="demo-intensity"
              type="range"
              min={meta.range[0]}
              max={meta.range[1]}
              step={meta.step}
              value={scenario.intensity}
              onChange={(e) => setScenario({ ...scenario, intensity: Number(e.target.value) })}
              style={{ "--fill": `${((scenario.intensity - meta.range[0]) / (meta.range[1] - meta.range[0])) * 100}%` } as CSSProperties}
              className="range mt-3 block w-full"
            />
          </label>
          <p role="status" className="text-2xl leading-snug font-semibold lg:mt-auto">
            {end ? (
              <>
                Jalur aman ke <span className="text-fajar">{ASSEMBLY_NAMES[tileAt(...end)]}</span>, {Math.round(pathLength(route!))} petak.{" "}
                <span className="text-redup">
                  {hazards.size} petak {scenario.kind === "banjir" ? "tergenang" : "rawan reruntuhan"}.
                </span>
              </>
            ) : (
              <span className="text-bahaya">Tidak ada titik kumpul yang aman. Naik ke lantai 2.</span>
            )}
          </p>
        </div>
        <figure className="self-start overflow-hidden rounded-lg border border-malam-3 bg-malam shadow-edge">
          <CampusPlan
            labels={1.2}
            route={route ?? undefined}
            hazards={hazards}
            hazardColor={HAZARD_COLOR[scenario.kind]}
            label={`Denah sekolah, ${SCENARIO_LABEL[scenario.kind]} ${num(scenario.intensity, 1)} ${meta.unit}`.trim() + ", dengan jalur evakuasi"}
          >
            {route && (
              <Walker key={route.join()} points={route.map(([x, z]) => [x + 0.5, z + 0.5])} seconds={pathLength(route) * 0.2} fill="#eaf1ff" />
            )}
          </CampusPlan>
          <figcaption className="flex flex-wrap gap-x-6 gap-y-1 border-t border-malam-3 px-4 py-3">
            <span className="inline-flex items-center gap-2">
              <svg aria-hidden="true" width="28" height="6" viewBox="0 0 28 6">
                <line x1="2" y1="3" x2="26" y2="3" stroke="#ff8a3d" strokeWidth="4" strokeDasharray="6 4" strokeLinecap="round" />
              </svg>
              Jalur evakuasi
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3.5 rounded-sm opacity-70" style={{ background: HAZARD_COLOR[scenario.kind] }} />
              {scenario.kind === "banjir" ? "Tergenang" : "Rawan reruntuhan"}
            </span>
            <span className="inline-flex items-center gap-2">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
                <circle cx="7" cy="7" r="5" fill="none" stroke="#34c47c" strokeWidth="2.5" />
              </svg>
              Titik kumpul
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3.5 rounded-sm bg-kabut" />
              Gedung
            </span>
          </figcaption>
        </figure>
      </div>
      <Portal />
    </section>
  );
}

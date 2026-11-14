"use client";

import { MAP } from "@/lib/campus";
import { INTENSITY, SCENARIO_LABEL } from "@/lib/sim";
import { setState, useDrill } from "./drillStore";

export const panel = "rounded-lg border border-malam-3 bg-malam/92 p-4 shadow-lg";
export const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-semibold active:translate-y-px disabled:opacity-60";
export const primary = `${btn} bg-fajar text-malam hover:bg-fajar-tua`;
export const ghost = `${btn} border border-malam-3 text-pasir hover:border-redup`;
export const radio =
  "flex min-h-11 items-center justify-center rounded-md text-center border border-malam-3 px-3 text-sm font-semibold has-checked:border-fajar has-checked:text-fajar has-focus-visible:outline-2 has-focus-visible:outline-fajar";

// The disasters this map can have; picking one here picks it for both learning and the drill.
export function KindPicker({ legend }: { legend: string }) {
  const kind = useDrill((s) => s.scenario.kind);
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {MAP.disasters.map((k) => (
          <label key={k} className={radio}>
            <input
              type="radio"
              name={`kind-${legend}`}
              className="sr-only"
              checked={kind === k}
              onChange={() => setState({ scenario: { kind: k, intensity: INTENSITY[k].start } })}
            />
            {SCENARIO_LABEL[k]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

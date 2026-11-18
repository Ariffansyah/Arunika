import { HAZARD_LABEL, type Hazard } from "./gladi.ts";
import { LESSONS } from "./lessons.ts";
import { MAPS, type Setting } from "./maps.ts";
import { blankTracked, grade } from "./sim.ts";

// What the warden knows about where it stands, sent by the drill and checked here against Arunika's own data:
// only ids and labels from the maps and the checklist get through, never free text.
export type WardenContext = {
  peta: Setting;
  kind: Hazard;
  // Assembly points the engine finds safe for the chosen scenario.
  goals: string[];
  // The building the student stands in, if any.
  near: string | null;
  last: { kind: Hazard; score: number; reached: boolean; missed: string[] } | null;
};

const isHazard = (v: unknown): v is Hazard => typeof v === "string" && v in LESSONS;
const labelsOf = (kind: Hazard) => new Set([false, true].flatMap((outside) => grade(kind, blankTracked(), outside).map((c) => c.label)));

export function parseContext(raw: unknown): WardenContext | null {
  const c = raw as Record<string, unknown> | null;
  const map = typeof c?.peta === "string" ? MAPS[c.peta as Setting] : undefined;
  if (!map || !isHazard(c?.kind) || !Array.isArray(c.goals)) return null;
  const goals = c.goals.filter((g): g is string => typeof g === "string" && g in map.assemblyNames);
  const near = typeof c.near === "string" && c.near in map.buildings ? c.near : null;
  const l = c.last as Record<string, unknown> | null | undefined;
  const last =
    l && isHazard(l.kind) && typeof l.score === "number" && Number.isFinite(l.score) && Array.isArray(l.missed)
      ? {
          kind: l.kind,
          score: Math.round(Math.min(1200, Math.max(0, l.score))),
          reached: l.reached === true,
          missed: l.missed.filter((m): m is string => typeof m === "string" && labelsOf(l.kind as Hazard).has(m)).slice(0, 8),
        }
      : null;
  return { peta: map.id, kind: c.kind, goals: [...new Set(goals)], near, last };
}

export function contextFacts(c: WardenContext) {
  const map = MAPS[c.peta]!;
  const hazard = HAZARD_LABEL[c.kind].toLowerCase();
  const refuge = [...c.goals.map((g) => map.assemblyNames[g]), ...(c.kind === "banjir" ? ["lantai 2 Gedung Kelas A"] : [])];
  return [
    `Sekolah ini memakai peta ${map.name}. Gedungnya: ${Object.values(map.buildings)
      .map((b) => `${b.name} (${b.floors} lantai)`)
      .join(", ")}. Titik kumpulnya: ${Object.values(map.assemblyNames).join(", ")}.`,
    `Siswa sedang memilih latihan ${hazard}. Menurut mesin simulasi, tujuan aman untuk ${hazard} adalah ${refuge.join(" atau ") || "belum ada"}.`,
    `Urutan yang diajarkan dan dinilai untuk ${hazard}: ${LESSONS[c.kind].steps.map((s, i) => `${i + 1}) ${s.title}`).join(" ")}`,
    c.near ? `Siswa sedang berada di ${map.buildings[c.near].name}.` : "",
    c.last
      ? `Latihan terakhir siswa: ${HAZARD_LABEL[c.last.kind].toLowerCase()}, skor ${c.last.score} dari 1200, ${c.last.reached ? "sampai di tempat aman" : "tidak sampai di tempat aman"}. Langkah yang terlewat: ${c.last.missed.join("; ") || "tidak ada"}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

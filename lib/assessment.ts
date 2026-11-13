export const LEVELS = ["rendah", "sedang", "tinggi", "sangat_tinggi"] as const;
export const PRIORITIES = ["segera", "jangka_menengah", "jangka_panjang"] as const;
export const COST_BANDS = ["rendah", "sedang", "tinggi"] as const;
export const HAZARDS = ["gempa", "banjir", "umum"] as const;

export type Level = (typeof LEVELS)[number];
export type Recommendation = {
  action: string;
  priority: (typeof PRIORITIES)[number];
  cost_band: (typeof COST_BANDS)[number];
};
export type Assessment = {
  is_building: boolean;
  // Resilience: higher is better. `level` is the vulnerability, so they move in opposite directions.
  score: number;
  level: Level;
  summary: string;
  observations: string[];
  recommendations: Recommendation[];
};

export const LEVEL_LABEL: Record<Level, string> = {
  rendah: "Kerentanan rendah",
  sedang: "Kerentanan sedang",
  tinggi: "Kerentanan tinggi",
  sangat_tinggi: "Kerentanan sangat tinggi",
};
export const PRIORITY_LABEL: Record<Recommendation["priority"], string> = {
  segera: "Segera",
  jangka_menengah: "Jangka menengah",
  jangka_panjang: "Jangka panjang",
};
export const COST_LABEL: Record<Recommendation["cost_band"], string> = {
  rendah: "Biaya rendah",
  sedang: "Biaya sedang",
  tinggi: "Biaya tinggi",
};

export const ASSESSMENT_SCHEMA = {
  type: "object",
  properties: {
    is_building: { type: "boolean" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    level: { type: "string", enum: [...LEVELS] },
    summary: { type: "string" },
    observations: { type: "array", items: { type: "string" }, maxItems: 6 },
    recommendations: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          action: { type: "string" },
          priority: { type: "string", enum: [...PRIORITIES] },
          cost_band: { type: "string", enum: [...COST_BANDS] },
        },
        required: ["action", "priority", "cost_band"],
      },
    },
  },
  required: ["is_building", "score", "level", "summary", "observations", "recommendations"],
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 600) : null);
const oneOf = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : null);

/** Model output is untrusted: keep only well-formed fields, reject the whole thing if the core is missing. */
export function parseAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const level = oneOf(LEVELS, r.level);
  const summary = str(r.summary);
  if (typeof r.is_building !== "boolean" || typeof r.score !== "number" || !level || !summary) return null;
  const observations = (Array.isArray(r.observations) ? r.observations : []).map(str).filter((s) => s !== null);
  const recommendations = (Array.isArray(r.recommendations) ? r.recommendations : []).flatMap((x) => {
    const action = str(x?.action);
    const priority = oneOf(PRIORITIES, x?.priority);
    const cost_band = oneOf(COST_BANDS, x?.cost_band);
    return action && priority && cost_band ? [{ action, priority, cost_band }] : [];
  });
  return {
    is_building: r.is_building,
    score: Math.round(Math.min(100, Math.max(0, r.score))),
    level,
    summary,
    observations: observations.slice(0, 6),
    recommendations: recommendations.slice(0, 6),
  };
}

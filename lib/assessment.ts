export const LEVELS = ["rendah", "sedang", "tinggi", "sangat_tinggi"] as const;
export const PRIORITIES = ["segera", "jangka_menengah", "jangka_panjang"] as const;
export const COST_BANDS = ["rendah", "sedang", "tinggi"] as const;

export type Level = (typeof LEVELS)[number];
export type Recommendation = {
  action: string;
  priority: (typeof PRIORITIES)[number];
  cost_band: (typeof COST_BANDS)[number];
};
// A school's latest assessment, as stored in `assessments.result`: today the debrief of a gladi ruang.
export type Assessment = {
  // Readiness: higher is better. `level` is the vulnerability, so they move in opposite directions.
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

export const levelOf = (score: number): Level =>
  score >= 75 ? "rendah" : score >= 55 ? "sedang" : score >= 35 ? "tinggi" : "sangat_tinggi";

export const RECOMMENDATIONS_SCHEMA = {
  type: "array",
  maxItems: 5,
  items: {
    type: "object",
    properties: {
      action: { type: "string" },
      priority: { type: "string", enum: [...PRIORITIES] },
      cost_band: { type: "string", enum: [...COST_BANDS] },
    },
    required: ["action", "priority", "cost_band"],
    additionalProperties: false,
  },
};

export const str = (v: unknown, max = 600) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
export const oneOf = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : null);

export function parseRecommendations(raw: unknown): Recommendation[] {
  return (Array.isArray(raw) ? raw : [])
    .flatMap((x) => {
      const action = str(x?.action);
      const priority = oneOf(PRIORITIES, x?.priority);
      const cost_band = oneOf(COST_BANDS, x?.cost_band);
      return action && priority && cost_band ? [{ action, priority, cost_band }] : [];
    })
    .slice(0, 6);
}

// Stored rows include older photo assessments and seed data; keep only well-formed fields.
export function parseAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const level = oneOf(LEVELS, r.level);
  const summary = str(r.summary);
  if (typeof r.score !== "number" || !level || !summary) return null;
  return {
    score: Math.round(Math.min(100, Math.max(0, r.score))),
    level,
    summary,
    observations: (Array.isArray(r.observations) ? r.observations : []).map((o) => str(o)).filter((s) => s !== null).slice(0, 6),
    recommendations: parseRecommendations(r.recommendations),
  };
}

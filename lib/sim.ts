import {
  ASSEMBLY,
  BLOCKED_CHARS,
  BUILDINGS,
  H,
  W,
  idx,
  isBlocked,
  tileAt,
  tileElevation,
  type Material,
  type Soil,
  type Tile,
} from "./campus.ts";

export type Scenario = { kind: "banjir" | "gempa"; intensity: number };

export type Site = { soil: Soil; coast_km: number; rain_30d_mm: number };
export type Structure = { floors: number; material: Material; built_year: number };

export const SCENARIO_LABEL = { banjir: "Banjir Rob", gempa: "Gempa Bumi" } as const;

export const INTENSITY = {
  gempa: { range: [5, 8] as [number, number], step: 0.1, label: "Magnitudo", unit: "" },
  banjir: { range: [0.5, 2] as [number, number], step: 0.1, label: "Tinggi air", unit: "m" },
};

// Heuristic weights, not a trained model: they encode the direction of each factor
// (soft soil amplifies shaking, unreinforced brick fails first, upper floors give flood refuge).
const MATERIAL_QUAKE: Record<Material, number> = {
  beton_bertulang: 0,
  baja_ringan: 0.3,
  kayu: 0.5,
  bata_tanpa_tulangan: 2,
};
const MATERIAL_FLOOD: Record<Material, number> = {
  beton_bertulang: 0,
  baja_ringan: 0.4,
  kayu: 1.2,
  bata_tanpa_tulangan: 0.8,
};
const SOIL: Record<Soil, number> = { keras: 0, sedang: 0.6, lunak: 1.4 };

const logistic = (z: number) => 100 / (1 + Math.exp(-z));

export function structureRisk(b: Structure, site: Site, s: Scenario, year = new Date().getFullYear()) {
  const age = Math.max(0, year - b.built_year);
  const z =
    s.kind === "gempa"
      ? -4.5 + 1.5 * (s.intensity - 5) + MATERIAL_QUAKE[b.material] + SOIL[site.soil] + 0.03 * age + 0.3 * (b.floors - 1)
      : -4 +
        2.2 * s.intensity +
        MATERIAL_FLOOD[b.material] +
        1.5 / (1 + site.coast_km) +
        (0.8 * site.rain_30d_mm) / 300 +
        0.02 * age -
        0.6 * (b.floors - 1);
  return Math.round(logistic(z));
}

export function campusRisks(main: Structure, site: Site, s: Scenario, year?: number) {
  const out: Record<string, number> = {};
  for (const [id, b] of Object.entries(BUILDINGS)) {
    out[id] = structureRisk(
      { floors: b.floors, material: b.material ?? main.material, built_year: main.built_year + b.yearOffset },
      site,
      s,
      year,
    );
  }
  return out;
}

export function hazardTiles(s: Scenario, risks: Record<string, number>, waterLevel = s.intensity) {
  const out = new Set<number>();
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (isBlocked(x, z)) continue;
      if (s.kind === "banjir") {
        if (tileElevation(x, z) < waterLevel) out.add(idx(x, z));
        continue;
      }
      for (const [id, risk] of Object.entries(risks)) {
        const r = risk >= 60 ? 2 : risk >= 30 ? 1 : 0;
        if (r && nearChar(x, z, id, r)) out.add(idx(x, z));
      }
    }
  }
  return out;
}

function nearChar(x: number, z: number, c: string, r: number) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (tileAt(x + dx, z + dz) === c) return true;
  return false;
}

export function safeAssembly(s: Scenario, hazards: Set<number>): Tile[] {
  return ASSEMBLY.filter(([x, z]) =>
    s.kind === "banjir" ? tileElevation(x, z) > s.intensity + 0.2 : !hazards.has(idx(x, z)),
  );
}

const HAZARD_COST = 8;
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function bestRoute(grid: string[], start: Tile, goals: Tile[], hazards: Set<number>): Tile[] | null {
  if (!goals.length) return null;
  const w = grid[0].length;
  const blocked = (x: number, z: number) => {
    const c = grid[z]?.[x];
    return c === undefined || BLOCKED_CHARS.includes(c);
  };
  const h = (x: number, z: number) =>
    Math.min(
      ...goals.map(([gx, gz]) => {
        const dx = Math.abs(gx - x);
        const dz = Math.abs(gz - z);
        return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
      }),
    );
  const key = (x: number, z: number) => z * w + x;
  const goalKeys = new Set(goals.map(([x, z]) => key(x, z)));
  const g = new Map<number, number>([[key(...start), 0]]);
  const came = new Map<number, number>();
  const open = new Map<number, number>([[key(...start), h(...start)]]);
  const closed = new Set<number>();

  while (open.size) {
    // The grid is ~1k tiles, so a linear scan for the lowest f is cheap enough.
    let cur = -1;
    let best = Infinity;
    for (const [k, f] of open) if (f < best) [cur, best] = [k, f];
    open.delete(cur);
    if (goalKeys.has(cur)) {
      const path: Tile[] = [];
      for (let k: number | undefined = cur; k !== undefined; k = came.get(k)) path.push([k % w, Math.floor(k / w)]);
      return path.reverse();
    }
    closed.add(cur);
    const cx = cur % w;
    const cz = Math.floor(cur / w);
    for (const [dx, dz, step] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (blocked(nx, nz) || (dx && dz && (blocked(cx + dx, cz) || blocked(cx, cz + dz)))) continue;
      const nk = key(nx, nz);
      if (closed.has(nk)) continue;
      const cost = g.get(cur)! + step * (hazards.has(nk) ? HAZARD_COST : 1);
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost);
        came.set(nk, cur);
        open.set(nk, cost + h(nx, nz));
      }
    }
  }
  return null;
}

export const pathLength = (path: Tile[]) =>
  path.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - path[i][0], z - path[i][1]), 0);

// Metres per second: a brisk evacuation walk and a run.
export const WALK_SPEED = 1.5;
export const RUN_SPEED = 3.5;
export const QUAKE_SHAKE_S = 8;
export const FLOOD_RISE_S = 20;
export const DRILL_LIMIT_S = 180;

export type DrillStats = {
  scenario: Scenario;
  reached: boolean;
  timeS: number;
  walked: number;
  optimalLen: number;
  hazardS: number;
  coverS: number;
  hintUsed: boolean;
};

export function scoreDrill(d: DrillStats) {
  if (!d.reached) return 0;
  const optimalTime = (d.scenario.kind === "gempa" ? QUAKE_SHAKE_S : 0) + d.optimalLen / WALK_SPEED;
  const score =
    1000 -
    Math.max(0, d.timeS - optimalTime) * 5 -
    Math.max(0, d.walked - d.optimalLen) * 3 -
    d.hazardS * 20 -
    (d.hintUsed ? 150 : 0) +
    (d.scenario.kind === "gempa" ? (200 * Math.min(d.coverS, QUAKE_SHAKE_S)) / QUAKE_SHAKE_S : 0);
  return Math.round(Math.min(1200, Math.max(0, score)));
}

export const waterLevel = (s: Scenario, t: number) =>
  s.kind === "banjir" ? s.intensity * Math.min(1, Math.max(0, t / FLOOD_RISE_S)) : 0;

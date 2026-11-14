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
export const FLOOD_RISE_S = 90;

// Seeded so every player in a room sees the same drill.
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Window = [from: number, to: number];
export type Timeline = { shake: Window | null; aftershock: Window | null; limit: number };

// Compressed real behaviour: a bigger quake shakes longer, and a strong one is followed by an aftershock.
export const shakeSeconds = (magnitude: number) => 6 + (magnitude - 5) * 5;

export function timeline(s: Scenario, seed: number): Timeline {
  const rnd = random(seed);
  if (s.kind !== "gempa") return { shake: null, aftershock: null, limit: 240 };
  const shake = shakeSeconds(s.intensity);
  const at = shake + 20 + rnd() * 15;
  return { shake: [0, shake], aftershock: s.intensity >= 6 ? [at, at + 3 + (s.intensity - 5)] : null, limit: 240 };
}

export const within = (w: Window | null, t: number) => !!w && t >= w[0] && t < w[1];

// What a player did during a drill, gathered as it runs.
export type Tracked = {
  reached: boolean;
  shakeS: number;
  coverS: number;
  deskS: number;
  shakeMoved: number;
  nearFallS: number;
  runIndoorS: number;
  reentered: boolean;
  debrisS: number;
  aftershockS: number;
  aftershockCoverS: number;
  aftershockIndoorS: number;
  powerOff: boolean;
  alarm: boolean;
  deepWaterS: number;
};

export type Check = { label: string; ok: boolean; got: number; max: number };

const check = (label: string, max: number, part: number, ok = part >= 1): Check => ({
  label,
  ok,
  got: Math.round(max * Math.min(1, Math.max(0, part))),
  max,
});

// The procedure for each disaster as a checklist; points add up to 1000.
export function grade(kind: Scenario["kind"], t: Tracked): Check[] {
  if (kind === "gempa") {
    // Under a desk counts fully, crouching in the open half; 80% of the shaking is enough for full marks.
    const cover = t.shakeS ? (t.deskS + 0.5 * (t.coverS - t.deskS)) / t.shakeS / 0.8 : 1;
    const after = t.aftershockS ? t.aftershockCoverS / t.aftershockS / 0.5 : 1;
    return [
      check("Berlindung di bawah meja saat guncangan", 200, cover),
      check("Tetap di tempat selama guncangan", 100, t.shakeMoved < 2 ? 1 : 0),
      check("Menjauhi jendela dan lemari", 100, t.nearFallS < 1 ? 1 : 0),
      check("Berjalan, tidak berlari di dalam gedung", 100, t.runIndoorS < 1 ? 1 : 0),
      check("Tidak kembali masuk gedung", 100, t.reentered ? 0 : 1),
      check("Menghindari reruntuhan di luar gedung", 100, 1 - t.debrisS / 10, t.debrisS < 2),
      check("Merunduk di luar gedung saat gempa susulan", 100, t.aftershockIndoorS < 1 ? after : 0),
      check("Lapor di titik kumpul aman", 200, t.reached ? 1 : 0),
    ];
  }
  return [
    check("Mematikan listrik di panel", 150, t.powerOff ? 1 : 0),
    check("Membunyikan kentongan", 150, t.alarm ? 1 : 0),
    check("Tidak melewati air setinggi lutut", 300, 1 - t.deepWaterS / 20, t.deepWaterS < 3),
    check("Naik ke tempat tinggi dan lapor", 400, t.reached ? 1 : 0),
  ];
}

export type DrillStats = {
  scenario: Scenario;
  reached: boolean;
  timeS: number;
  walked: number;
  optimalLen: number;
  // Time before anyone should start walking, such as the shaking.
  leadS: number;
  hintUsed: boolean;
  checks: Check[];
};

export function scoreDrill(d: DrillStats) {
  if (!d.reached) return 0;
  const optimalTime = d.leadS + d.optimalLen / WALK_SPEED;
  const speed = 200 * Math.min(1, Math.max(0, 1 - Math.max(0, d.timeS - optimalTime) / 120));
  const score = d.checks.reduce((sum, c) => sum + c.got, 0) + speed - (d.hintUsed ? 150 : 0);
  return Math.round(Math.min(1200, Math.max(0, score)));
}

export const waterLevel = (s: Scenario, t: number) =>
  s.kind === "banjir" ? s.intensity * Math.min(1, Math.max(0, t / FLOOD_RISE_S)) : 0;

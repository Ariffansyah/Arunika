import {
  ASSEMBLY,
  BLOCKED_CHARS,
  BUILDINGS,
  GRID,
  H,
  MAP,
  TILE,
  W,
  buildingRects,
  idx,
  isBlocked,
  tileAt,
  tileCenter,
  tileElevation,
  type Material,
  type Soil,
  type Tile,
} from "./campus.ts";
import type { Runout } from "./maps.ts";

export type Scenario = { kind: "gempa" | "banjir" | "angin" | "longsor"; intensity: number };

export type Site = { soil: Soil; coast_km: number; rain_30d_mm: number };
export type Structure = { floors: number; material: Material; built_year: number };

export const SCENARIO_LABEL = { gempa: "Gempa Bumi", banjir: MAP.floodLabel, angin: "Angin Puting Beliung", longsor: "Tanah Longsor" };

export const INTENSITY = {
  gempa: { range: [5, 8] as [number, number], step: 0.1, label: "Magnitudo", unit: "", start: 6.5 },
  banjir: { range: [0.5, 2] as [number, number], step: 0.1, label: "Tinggi air", unit: "m", start: 1 },
  angin: { range: [60, 150] as [number, number], step: 5, label: "Kecepatan angin", unit: "km/jam", start: 110 },
  longsor: { range: [50, 300] as [number, number], step: 10, label: "Curah hujan", unit: "mm/hari", start: 200 },
};

export function inLane({ ax, az, bx, bz, r }: Runout, x: number, z: number) {
  const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
  return Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)) < r;
}

// Nobody can tell beforehand which part of a slope gives way, so every lane it could slide down counts as danger.
export const inRunout = (x: number, z: number) => MAP.runouts.some((lane) => inLane(lane, x, z));

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
// Light steel and timber roofs are stripped first by strong wind.
const MATERIAL_WIND: Record<Material, number> = {
  beton_bertulang: 0,
  bata_tanpa_tulangan: 0.8,
  kayu: 1.4,
  baja_ringan: 2.2,
};
const SOIL: Record<Soil, number> = { keras: 0, sedang: 0.6, lunak: 1.4 };

const logistic = (z: number) => 100 / (1 + Math.exp(-z));

// `slope` is how exposed a building is to the landslide runout, from 0 (far) to 1 (inside it).
export function structureRisk(b: Structure, site: Site, s: Scenario, year = new Date().getFullYear(), slope = 0) {
  const age = Math.max(0, year - b.built_year);
  const z =
    s.kind === "gempa"
      ? -4.5 + 1.5 * (s.intensity - 5) + MATERIAL_QUAKE[b.material] + SOIL[site.soil] + 0.03 * age + 0.3 * (b.floors - 1)
      : s.kind === "banjir"
        ? -4 +
          2.2 * s.intensity +
          MATERIAL_FLOOD[b.material] +
          1.5 / (1 + site.coast_km) +
          (0.8 * site.rain_30d_mm) / 300 +
          0.02 * age -
          0.6 * (b.floors - 1)
        : s.kind === "angin"
          ? -5 + 0.04 * (s.intensity - 60) + MATERIAL_WIND[b.material] + 0.02 * age + 0.2 * (b.floors - 1)
          : -6 + 0.012 * (s.intensity - 50) + SOIL[site.soil] + 0.01 * age + 7 * slope;
  return Math.round(logistic(z));
}

// Share of a footprint (in tiles) that lies in the landslide runout.
function slopeExposure(x0: number, z0: number, x1: number, z1: number) {
  let inside = 0;
  let all = 0;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      all++;
      if (inRunout((x + 0.5) * TILE, (z + 0.5) * TILE)) inside++;
    }
  }
  return inside / all;
}

export function campusRisks(main: Structure, site: Site, s: Scenario, year?: number) {
  const out: Record<string, number> = {};
  const rects = buildingRects();
  for (const [id, b] of Object.entries(BUILDINGS)) {
    const r = rects[id];
    out[id] = structureRisk(
      { floors: b.floors, material: b.material ?? main.material, built_year: main.built_year + b.yearOffset },
      site,
      s,
      year,
      s.kind === "longsor" ? slopeExposure(r.x0, r.z0, r.x1, r.z1) : 0,
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
      if (s.kind === "longsor") {
        if (inRunout((x + 0.5) * TILE, (z + 0.5) * TILE)) out.add(idx(x, z));
        continue;
      }
      if (s.kind === "angin") {
        // Falling branches and whole trees: stay clear of them in a whirlwind.
        if (nearChar(x, z, "T", 1)) out.add(idx(x, z));
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

// A whirlwind is sat out indoors, so it has no safe open-air assembly point; in a landslide nobody climbs the hill.
export function safeAssembly(s: Scenario, hazards: Set<number>): Tile[] {
  if (s.kind === "angin") return [];
  return ASSEMBLY.filter(([x, z]) =>
    s.kind === "banjir" ? tileElevation(x, z) > s.intensity + 0.2 : !hazards.has(idx(x, z)) && !(s.kind === "longsor" && nearChar(x, z, "h", 1)),
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

export type EvacSign = { x: number; z: number; tile: Tile; ry: number; arrow: number };

// Permanent signs from every building's entrance to the nearest assembly point, as a school would post them.
// Each panel faces whoever walks up the route; "up" on it means straight on. `ry` turns the panel about y,
// `arrow` turns the arrow on its face.
export function evacuationSigns(): EvacSign[] {
  const rects = buildingRects();
  const out: EvacSign[] = [];
  for (const [id, b] of Object.entries(BUILDINGS)) {
    const r = rects[id];
    const mx = Math.round((r.x0 + r.x1) / 2);
    const mz = Math.round((r.z0 + r.z1) / 2);
    const start: Tile = b.entrance === "S" ? [mx, r.z1 + 1] : b.entrance === "N" ? [mx, r.z0 - 1] : b.entrance === "E" ? [r.x1 + 1, mz] : [r.x0 - 1, mz];
    if (isBlocked(...start)) continue;
    const path = bestRoute(GRID, start, ASSEMBLY, new Set()) ?? [];
    for (let i = 1; i + 2 < path.length; i += 5) {
      const [px, pz] = path[i];
      const unit = (x: number, z: number) => [x / Math.hypot(x, z), z / Math.hypot(x, z)];
      const [ax, az] = unit(px - path[i - 1][0], pz - path[i - 1][1]);
      const [nx, nz] = unit(path[i + 2][0] - px, path[i + 2][1] - pz);
      // The walker's right hand; the post stands there, or on the left if that tile is built on.
      const [rx, rz] = [-az, ax];
      const [cx, cz] = tileCenter(px, pz);
      const side = [1, -1].find((k) => !isBlocked(Math.floor((cx + k * rx * 1.3) / TILE), Math.floor((cz + k * rz * 1.3) / TILE)));
      if (side === undefined) continue;
      const [x, z] = [cx + side * rx * 1.3, cz + side * rz * 1.3];
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
      const right = nx * rx + nz * rz;
      const ahead = nx * ax + nz * az;
      out.push({ x, z, tile: [px, pz], ry: Math.atan2(-ax, -az), arrow: Math.atan2(ahead, right) });
    }
  }
  return out;
}

export const pathLength = (path: Tile[]) =>
  path.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - path[i][0], z - path[i][1]), 0);

// Metres per second: a brisk evacuation walk and a run.
export const WALK_SPEED = 1.5;
export const RUN_SPEED = 3.5;
export const CROUCH_SPEED = 0.9;
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
export type Timeline = {
  shake: Window | null;
  aftershock: Window | null;
  // When the whirlwind is over the campus, and the line it travels along.
  wind: Window | null;
  path: [[number, number], [number, number]] | null;
  // When warning signs show on the hill, and when the slope gives way.
  signs: number[];
  slide: number | null;
  limit: number;
};

export const NONE: Timeline = { shake: null, aftershock: null, wind: null, path: null, signs: [], slide: null, limit: 240 };
// A whirlwind crosses at about 8 m/s; the campus is 120 m wide.
export const VORTEX_SPEED = 8;

// Compressed real behaviour: a bigger quake shakes longer, and a strong one is followed by an aftershock.
export const shakeSeconds = (magnitude: number) => 6 + (magnitude - 5) * 5;

export function timeline(s: Scenario, seed: number): Timeline {
  const rnd = random(seed);
  if (s.kind === "gempa") {
    const shake = shakeSeconds(s.intensity);
    const at = shake + 20 + rnd() * 15;
    return { ...NONE, shake: [0, shake], aftershock: s.intensity >= 6 ? [at, at + 3 + (s.intensity - 5)] : null };
  }
  if (s.kind === "angin") {
    // Stronger wind comes on faster: 35 to 55 s of warning.
    const arrive = 55 - ((s.intensity - 60) / 90) * 20;
    const path: Timeline["path"] = [
      [-40, 10 + rnd() * 64],
      [160, 10 + rnd() * 64],
    ];
    const cross = Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) / VORTEX_SPEED;
    return { ...NONE, wind: [arrive, arrive + cross], path };
  }
  if (s.kind === "longsor") {
    // More rain, sooner failure: 60 to 90 s after the drill starts.
    const slide = 90 - ((s.intensity - 50) / 250) * 30;
    return { ...NONE, signs: [0.15, 0.35, 0.55].map((f) => f * slide), slide };
  }
  return NONE;
}

// Where the whirlwind is at time t (it starts 40 m outside the campus), or null before it forms and after it leaves.
export function vortexAt(tl: Timeline, t: number): [number, number] | null {
  if (!tl.wind || !tl.path || t < tl.wind[0] || t > tl.wind[1]) return null;
  const f = (t - tl.wind[0]) / (tl.wind[1] - tl.wind[0]);
  const [[ax, az], [bx, bz]] = tl.path;
  return [ax + (bx - ax) * f, az + (bz - az) * f];
}

export const vortexRadius = (s: Scenario) => 10 + ((s.intensity - 60) / 90) * 8;

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
  sheltered: boolean;
  windS: number;
  windCoverS: number;
  windWindowS: number;
  windExposedS: number;
  leftShelter: boolean;
  signSeen: boolean;
  caught: boolean;
  slopeS: number;
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
  if (kind === "angin") {
    return [
      check("Masuk ke ruang aman sebelum angin tiba", 300, t.sheltered ? 1 : 0),
      check("Menjauhi jendela saat angin melintas", 150, t.windWindowS < 1 ? 1 : 0),
      check("Merunduk dan melindungi kepala", 150, t.windS ? t.windCoverS / t.windS / 0.5 : 0),
      check("Tidak di luar atau di kantin saat angin", 150, t.windExposedS < 1 ? 1 : 0),
      check("Tetap di ruang aman sampai angin reda", 100, t.leftShelter ? 0 : 1),
      check("Lapor ke guru setelah angin reda", 150, t.reached ? 1 : 0),
    ];
  }
  if (kind === "longsor") {
    return [
      check("Memeriksa tanda longsor di lereng", 150, t.signSeen ? 1 : 0),
      check("Membunyikan kentongan", 150, t.alarm ? 1 : 0),
      check("Menjauh dari lereng sebelum longsor", 300, t.caught ? 0 : 1),
      check("Tidak naik ke bukit atau mendekati lereng", 200, t.slopeS < 2 ? 1 : 0),
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

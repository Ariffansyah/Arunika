import {
  ASSEMBLY,
  BLOCKED_CHARS,
  BUILDINGS,
  H,
  MAP,
  TILE,
  W,
  buildingRects,
  idx,
  isBlocked,
  surfaceAt,
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

// Metres from the line a slope slides down; within the lane's `r` is in its path.
export function laneDistance({ ax, az, bx, bz }: Runout, x: number, z: number) {
  const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
  return Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
}

export const inLane = (lane: Runout, x: number, z: number) => laneDistance(lane, x, z) < lane.r;

// Seconds for a slide to run from the top of its lane to the bottom.
export const SLIDE_S = 6;

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

// The yard tile just outside a building's main doors.
export function entranceTile(id: string): Tile {
  const r = buildingRects()[id];
  const mx = Math.round((r.x0 + r.x1) / 2);
  const mz = Math.round((r.z0 + r.z1) / 2);
  const side = BUILDINGS[id].entrance;
  return side === "S" ? [mx, r.z1 + 1] : side === "N" ? [mx, r.z0 - 1] : side === "E" ? [r.x1 + 1, mz] : [r.x0 - 1, mz];
}

// Walking distance to the nearest assembly point from every tile, with the same moves as bestRoute.
// One field for every building, so two routes that meet never disagree about the way on.
function safetyField() {
  const dist = new Float64Array(W * H).fill(Infinity);
  const queue: [number, number, number][] = ASSEMBLY.map(([x, z]) => ((dist[idx(x, z)] = 0), [x, z, 0]));
  while (queue.length) {
    queue.sort((p, q) => q[2] - p[2]);
    const [x, z, d] = queue.pop()!;
    if (d > dist[idx(x, z)]) continue;
    for (const [dx, dz, step] of DIRS) {
      const [nx, nz] = [x + dx, z + dz];
      if (isBlocked(nx, nz) || (dx && dz && (isBlocked(x + dx, z) || isBlocked(x, z + dz)))) continue;
      if (d + step < dist[idx(nx, nz)]) {
        dist[idx(nx, nz)] = d + step;
        queue.push([nx, nz, d + step]);
      }
    }
  }
  return dist;
}

// Downhill on the field from a tile to an assembly point; straight steps win ties, so routes keep to the paths.
function walkField(dist: Float64Array, start: Tile): Tile[] {
  const path: Tile[] = [start];
  for (let [x, z] = start; dist[idx(x, z)] > 0 && path.length < W * H; ) {
    let best: Tile | null = null;
    let bestD = dist[idx(x, z)];
    for (const [dx, dz, step] of DIRS) {
      const [nx, nz] = [x + dx, z + dz];
      if (isBlocked(nx, nz) || (dx && dz && (isBlocked(x + dx, z) || isBlocked(x, z + dz)))) continue;
      if (dist[idx(nx, nz)] + step < bestD + 1e-9 && dist[idx(nx, nz)] < dist[idx(x, z)]) {
        best = [nx, nz];
        bestD = dist[idx(nx, nz)] + step - 1e-6;
      }
    }
    if (!best) break;
    path.push(best);
    [x, z] = best;
  }
  return path;
}

// A straight line between tile centres that stays on open ground.
function clearLine([ax, az]: Tile, [bx, bz]: Tile) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 4);
  for (let i = 1; i < n; i++) {
    const [x, z] = [ax + 0.5 + ((bx - ax) * i) / n, az + 0.5 + ((bz - az) * i) / n];
    // Not too close to a wall corner either, or the leg would shave past a building.
    for (const [ox, oz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
      if (isBlocked(Math.floor(x + ox), Math.floor(z + oz))) return false;
    }
  }
  return true;
}

// The route as the straight legs someone would actually walk, corner to corner.
function legs(path: Tile[]): Tile[] {
  const out = [path[0]];
  let from = 0;
  for (let i = 2; i < path.length; i++) {
    if (!clearLine(path[from], path[i])) {
      out.push(path[i - 1]);
      from = i - 1;
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

export type EvacSign = { x: number; z: number; tile: Tile; ry: number; arrow: number };

const EIGHTH = Math.PI / 4;
// Signs stop where the assembly point's own sign takes over, and never stand on a sports field or court.
const NEAR_GOAL = 4;
const REPEAT = 7;
const noPost = (x: number, z: number) => tileAt(x, z) === "g" || surfaceAt(x, z) === "court";

// Permanent signs from every building's entrance to the nearest assembly point, as a school would post them: at the
// exit, at every turn, and again along a long straight. Each panel faces whoever walks up the route; its arrow is
// one of the five a real sign carries (left, half left, straight on, half right, right). `ry` turns the panel about
// y; `arrow` turns the arrow on its face, 0 pointing right and π/2 straight on.
export function evacuationSigns(): EvacSign[] {
  const dist = safetyField();
  const out: EvacSign[] = [];
  const unit = ([x, z]: [number, number]) => [x / Math.hypot(x, z), z / Math.hypot(x, z)];
  const place = (at: Tile, into: number[], next: number[]) => {
    const [px, pz] = at;
    if (noPost(px, pz) || ASSEMBLY.some(([gx, gz]) => Math.hypot(gx - px, gz - pz) < NEAR_GOAL)) return;
    const [ax, az] = into;
    // The walker's right hand.
    const [rx, rz] = [-az, ax];
    const turn = Math.atan2(next[0] * ax + next[1] * az, next[0] * rx + next[1] * rz);
    const arrow = Math.min(Math.PI, Math.max(0, Math.round(turn / EIGHTH) * EIGHTH));
    // The post stands on the side away from the turn, so it is ahead of the walker and out of the way round the corner.
    const away = arrow > Math.PI / 2 + 0.1 ? 1 : -1;
    const [cx, cz] = tileCenter(px, pz);
    const side = [away, -away].find((k) => {
      const [x, z] = [cx + k * rx * 1.2, cz + k * rz * 1.2];
      return !isBlocked(Math.floor(x / TILE), Math.floor(z / TILE)) && !noPost(Math.floor(x / TILE), Math.floor(z / TILE));
    });
    if (side === undefined) return;
    const [x, z] = [cx + side * rx * 1.2, cz + side * rz * 1.2];
    const ry = Math.atan2(-ax, -az);
    // One sign is enough for walkers coming the same way; a junction can carry one per approach.
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2 || (Math.hypot(o.x - x, o.z - z) < 2 * TILE && Math.abs(Math.sin((o.ry - ry) / 2)) < 0.2))) return;
    out.push({ x, z, tile: at, ry, arrow });
  };
  const exitDir = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  for (const id of Object.keys(BUILDINGS)) {
    const start = entranceTile(id);
    if (isBlocked(...start) || !Number.isFinite(dist[idx(...start)])) continue;
    const corners = legs(walkField(dist, start));
    const dirs = corners.slice(1).map((c, i) => unit([c[0] - corners[i][0], c[1] - corners[i][1]]));
    // At the doors: the way out of the building to the first leg.
    if (dirs.length) place(start, exitDir[BUILDINGS[id].entrance], dirs[0]);
    for (let i = 1; i < corners.length - 1; i++) place(corners[i], dirs[i - 1], dirs[i]);
    // Along a long leg, a sign every REPEAT tiles, short of the corner it leads to.
    corners.slice(0, -1).forEach((c, i) => {
      const len = Math.hypot(corners[i + 1][0] - c[0], corners[i + 1][1] - c[1]);
      for (let k = REPEAT; k < len - 3; k += REPEAT) {
        const at: Tile = [Math.round(c[0] + dirs[i][0] * k), Math.round(c[1] + dirs[i][1] * k)];
        if (!isBlocked(...at)) place(at, dirs[i], dirs[i]);
      }
    });
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
  // Seconds for a flood to reach its full height.
  rise: number;
  limit: number;
};

export const NONE: Timeline = { shake: null, aftershock: null, wind: null, path: null, signs: [], slide: null, rise: FLOOD_RISE_S, limit: 240 };
// A whirlwind crosses at about 8 m/s; the campus is 120 m wide.
export const VORTEX_SPEED = 8;

// Compressed real behaviour: a bigger quake shakes longer, and a strong one is followed by an aftershock.
export const shakeSeconds = (magnitude: number) => 6 + (magnitude - 5) * 5;

// Every drill of the same disaster runs a little differently: how long it shakes and when the aftershock
// comes, when the wind arrives, when the slope gives way, how fast the water rises.
export function timeline(s: Scenario, seed: number): Timeline {
  const rnd = random(seed);
  if (s.kind === "gempa") {
    const shake = shakeSeconds(s.intensity) * (0.85 + rnd() * 0.3);
    const at = shake + 15 + rnd() * 25;
    return { ...NONE, shake: [0, shake], aftershock: s.intensity >= 6 ? [at, at + 3 + (s.intensity - 5)] : null };
  }
  if (s.kind === "banjir") return { ...NONE, rise: 60 + rnd() * 60 };
  if (s.kind === "angin") {
    // Stronger wind comes on faster: 35 to 55 s of warning, give or take 8 s.
    const arrive = 55 - ((s.intensity - 60) / 90) * 20 + (rnd() - 0.5) * 16;
    const path: Timeline["path"] = [
      [-40, 10 + rnd() * 64],
      [160, 10 + rnd() * 64],
    ];
    const cross = Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) / VORTEX_SPEED;
    return { ...NONE, wind: [arrive, arrive + cross], path };
  }
  if (s.kind === "longsor") {
    // More rain, sooner failure: 60 to 90 s after the drill starts, give or take 8 s.
    const slide = 90 - ((s.intensity - 50) / 250) * 30 + (rnd() - 0.5) * 16;
    return { ...NONE, signs: [0.15, 0.35, 0.55].map((f) => (f + rnd() * 0.08) * slide), slide };
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
  // Seconds into the drill when the player first walked 5 m, or -1 until then.
  leftAt: number;
  runWaterS: number;
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

export const blankTracked = (): Tracked => ({
  reached: false,
  shakeS: 0,
  coverS: 0,
  deskS: 0,
  shakeMoved: 0,
  nearFallS: 0,
  runIndoorS: 0,
  reentered: false,
  debrisS: 0,
  aftershockS: 0,
  aftershockCoverS: 0,
  aftershockIndoorS: 0,
  leftAt: -1,
  runWaterS: 0,
  deepWaterS: 0,
  sheltered: false,
  windS: 0,
  windCoverS: 0,
  windWindowS: 0,
  windExposedS: 0,
  leftShelter: false,
  signSeen: false,
  caught: false,
  slopeS: 0,
});

// `pending` marks a step that has not come up yet in a drill still running, such as a report not yet made.
export type Check = { label: string; ok: boolean; got: number; max: number; pending: boolean };

const check = (label: string, max: number, part: number, ok = part >= 1, pending = false): Check => ({
  label,
  ok,
  got: Math.round(max * Math.min(1, Math.max(0, part))),
  max,
  pending,
});

// The procedure for each disaster as a checklist; points add up to 1000. `outside` is a quake that
// catches the class out in the open, where cover means ducking clear of anything that can fall.
export function grade(kind: Scenario["kind"], t: Tracked, outside = false): Check[] {
  if (kind === "gempa") {
    // Under a desk counts fully, crouching in the open half; 80% of the shaking is enough for full marks.
    const cover = t.shakeS ? (t.deskS + 0.5 * (t.coverS - t.deskS)) / t.shakeS / 0.8 : 1;
    const after = t.aftershockS ? t.aftershockCoverS / t.aftershockS / 0.5 : 1;
    return [
      check(outside ? "Merunduk di tempat terbuka saat guncangan" : "Berlindung di bawah meja saat guncangan", 200, cover, cover >= 1, !t.shakeS),
      check("Tetap di tempat selama guncangan", 100, t.shakeMoved < 2 ? 1 : 0),
      check(outside ? "Menjauhi gedung dan pohon" : "Menjauhi jendela dan lemari", 100, t.nearFallS < 1 ? 1 : 0),
      check("Berjalan, tidak berlari di dalam gedung", 100, t.runIndoorS < 1 ? 1 : 0),
      check("Tidak kembali masuk gedung", 100, t.reentered ? 0 : 1),
      check("Menghindari reruntuhan di luar gedung", 100, 1 - t.debrisS / 10, t.debrisS < 2),
      check("Merunduk di luar gedung saat gempa susulan", 100, t.aftershockIndoorS < 1 ? after : 0, undefined, !t.aftershockS),
      check("Lapor di titik kumpul aman", 200, t.reached ? 1 : 0, undefined, !t.reached),
    ];
  }
  if (kind === "angin") {
    return [
      check("Masuk ke ruang aman sebelum angin tiba", 300, t.sheltered ? 1 : 0, undefined, !t.windS && !t.sheltered),
      check("Menjauhi jendela saat angin melintas", 150, t.windWindowS < 1 ? 1 : 0),
      check("Merunduk dan melindungi kepala", 150, t.windS ? t.windCoverS / t.windS / 0.5 : 0, undefined, !t.windS),
      check("Tidak di luar atau di kantin saat angin", 150, t.windExposedS < 1 ? 1 : 0),
      check("Tetap di ruang aman sampai angin reda", 100, t.leftShelter ? 0 : 1),
      check("Lapor ke guru setelah angin reda", 150, t.reached ? 1 : 0, undefined, !t.reached),
    ];
  }
  if (kind === "longsor") {
    return [
      check("Mengenali tanda longsor dari jauh", 200, t.signSeen ? 1 : 0, undefined, !t.signSeen),
      check("Menjauh dari lereng sebelum longsor", 300, t.caught ? 0 : 1),
      check("Tidak naik ke bukit atau mendekati lereng", 250, t.slopeS < 2 ? 1 : 0),
      check("Lapor di titik kumpul aman", 250, t.reached ? 1 : 0, undefined, !t.reached),
    ];
  }
  return [
    // Full marks for setting off within 10 s of the siren, none after 40 s.
    check("Segera bergerak saat sirene berbunyi", 150, t.leftAt < 0 ? 0 : 1 - Math.max(0, t.leftAt - 10) / 30, undefined, t.leftAt < 0),
    check("Berjalan, tidak berlari di genangan", 150, t.runWaterS < 1 ? 1 : 0),
    check("Tidak melewati air setinggi lutut", 300, 1 - t.deepWaterS / 20, t.deepWaterS < 3),
    check("Naik ke tempat tinggi dan lapor", 400, t.reached ? 1 : 0, undefined, !t.reached),
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

export const waterLevel = (s: Scenario, t: number, rise = FLOOD_RISE_S) =>
  s.kind === "banjir" ? s.intensity * Math.min(1, Math.max(0, t / rise)) : 0;

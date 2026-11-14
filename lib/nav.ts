import { BUILDINGS, GRID, H, SITE_D, SITE_W, TILE, W, elevationAt, findTiles, tileAt, tileCenter } from "./campus.ts";
import { PLAN, STOREY, type Box, type Item, type Ramp } from "./floorplan.ts";

export const RADIUS = 0.25;
// Routes use a smaller clearance: 0.5 m cells would otherwise close the 0.9 m gaps between desk rows.
const NAV_CLEARANCE = 0.15;
// Anything lower than a stair riser is stepped over; anything up to head height blocks.
const STEP = 0.2;
const BODY = 1.7;

// `walk: false` marks things only the camera bumps into: floors are stood on, roofs are overhead.
export type Solid = Box & { b?: string; floor?: number; walk?: false };

// Thin site wall along the outer tiles, as segments centred on each fence tile.
const isFence = (x: number, z: number) => GRID[z]?.[x] === "=";
export const FENCE = findTiles("=").flatMap(([tx, tz]) => {
  const along = isFence(tx - 1, tz) || isFence(tx + 1, tz);
  const across = isFence(tx, tz - 1) || isFence(tx, tz + 1);
  const [x, z] = tileCenter(tx, tz);
  return [...(along ? [{ x, z, sx: TILE, sz: 0.25 }] : []), ...(across || !along ? [{ x, z, sx: 0.25, sz: TILE }] : [])];
});
export const FENCE_H = 1.8;

export function itemBox(i: Item): Solid {
  const turned = Math.abs(Math.sin(i.ry)) > 0.5;
  const [hx, hz] = turned ? [i.size[2] / 2, i.size[0] / 2] : [i.size[0] / 2, i.size[2] / 2];
  return { x0: i.x - hx, x1: i.x + hx, z0: i.z - hz, z1: i.z + hz, y0: i.y, y1: i.y + i.size[1], b: i.b, floor: i.floor };
}

const SOLIDS: Solid[] = [
  ...PLAN.parts
    .filter((p) => p.kind !== "step" && p.kind !== "board" && p.kind !== "trim")
    .map((p): Solid => (p.kind === "floor" || p.kind === "roof" ? { ...p, walk: false } : p)),
  ...PLAN.items.filter((i) => i.solid).map(itemBox),
  ...FENCE.map((f) => {
    const y = elevationAt(f.x, f.z);
    return { x0: f.x - f.sx / 2, x1: f.x + f.sx / 2, z0: f.z - f.sz / 2, z1: f.z + f.sz / 2, y0: y - 1, y1: y + FENCE_H };
  }),
  ...findTiles("T").map(([tx, tz]) => {
    const [x, z] = tileCenter(tx, tz);
    const y = elevationAt(x, z);
    return { x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: y - 1, y1: y + 3 };
  }),
];

// Solids bucketed per site tile, so a query only scans its neighbourhood.
const BUCKETS: Solid[][] = Array.from({ length: W * H }, () => []);
for (const s of SOLIDS) {
  for (let tz = Math.max(0, Math.floor(s.z0 / TILE)); tz <= Math.min(H - 1, Math.floor(s.z1 / TILE)); tz++) {
    for (let tx = Math.max(0, Math.floor(s.x0 / TILE)); tx <= Math.min(W - 1, Math.floor(s.x1 / TILE)); tx++) BUCKETS[tz * W + tx].push(s);
  }
}

function anySolid(x0: number, z0: number, x1: number, z1: number, hit: (s: Solid) => boolean) {
  for (let tz = Math.max(0, Math.floor(z0 / TILE)); tz <= Math.min(H - 1, Math.floor(z1 / TILE)); tz++) {
    for (let tx = Math.max(0, Math.floor(x0 / TILE)); tx <= Math.min(W - 1, Math.floor(x1 / TILE)); tx++) {
      for (const s of BUCKETS[tz * W + tx]) if (hit(s)) return true;
    }
  }
  return false;
}

export const rampAt = (x: number, z: number): Ramp | undefined =>
  PLAN.ramps.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);

function rampY(r: Ramp, x: number, z: number) {
  const t = Math.min(1, Math.max(0, ((r.axis === "x" ? x : z) - r.c0) / (r.c1 - r.c0)));
  return r.y0 + (r.y1 - r.y0) * t;
}

export function buildingAt(x: number, z: number) {
  const c = tileAt(Math.floor(x / TILE), Math.floor(z / TILE));
  return BUILDINGS[c] ? c : null;
}

const UPPER_SLABS = PLAN.parts.filter((p) => p.kind === "floor" && p.floor === 1);

// Standing on the upper floor needs its slab underneath: the stairwell is open from the ground to the roof.
export const upperFloorAt = (x: number, z: number) =>
  !rampAt(x, z) && UPPER_SLABS.some((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);

// The surface a walker on `layer` stands on: stairs, a building floor, or the terrain.
export function groundY(x: number, z: number, layer: number) {
  const r = rampAt(x, z);
  if (r) return rampY(r, x, z);
  const b = buildingAt(x, z);
  if (b) return PLAN.floorY[b] + Math.min(layer, BUILDINGS[b].floors - 1) * STOREY;
  return elevationAt(x, z);
}

// Stairs decide the layer; anywhere else keeps it, except outside multi-storey buildings.
export function layerAt(x: number, z: number, layer: number) {
  const r = rampAt(x, z);
  if (r) return r.layer;
  const b = buildingAt(x, z);
  return b && BUILDINGS[b].floors > 1 ? layer : 0;
}

export type Extra = (x0: number, z0: number, x1: number, z1: number, lo: number, hi: number) => boolean;

// `extra` adds solids that change during play, such as closed doors.
export function free(x: number, z: number, layer: number, r = RADIUS, extra?: Extra) {
  if (x < r || z < r || x > SITE_W - r || z > SITE_D - r) return false;
  const g = groundY(x, z, layer);
  const lo = g + STEP;
  const hi = g + BODY;
  if (extra?.(x - r, z - r, x + r, z + r, lo, hi)) return false;
  return !anySolid(x - r, z - r, x + r, z + r, (s) => {
    if (s.walk === false || s.y1 <= lo || s.y0 >= hi) return false;
    const dx = x - Math.min(s.x1, Math.max(s.x0, x));
    const dz = z - Math.min(s.z1, Math.max(s.z0, z));
    return dx * dx + dz * dz < r * r;
  });
}

// For the camera: `skip` hides solids that are not drawn, such as floors cut away above the player.
export function solidAt(x: number, y: number, z: number, skip?: (s: Solid) => boolean) {
  if (y < elevationAt(x, z)) return true;
  return anySolid(x, z, x, z, (s) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && y >= s.y0 && y <= s.y1 && !skip?.(s));
}

export const CELL = 0.5;
export const NX = Math.round(SITE_W / CELL);
export const NZ = Math.round(SITE_D / CELL);
export const N = NX * NZ;
const HAZARD_COST = 8;

export const cellOf = (x: number, z: number) =>
  Math.min(NZ - 1, Math.max(0, Math.floor(z / CELL))) * NX + Math.min(NX - 1, Math.max(0, Math.floor(x / CELL)));
export const cellCenter = (k: number): [number, number] => [((k % NX) + 0.5) * CELL, (Math.floor(k / NX) + 0.5) * CELL];

type Grid = { open: Uint8Array; east: Uint8Array; south: Uint8Array; rampLayer: Int8Array };
let GRID_CACHE: Grid | null = null;

// open[layer * N + k] is 1 where a walker fits at the cell centre. east/south say whether the step to the next
// cell is clear: a wall thinner than a cell can stand between two open centres, but always covers their midpoint.
// Built once, on first use.
export function walkable(): Grid {
  if (GRID_CACHE) return GRID_CACHE;
  const open = new Uint8Array(2 * N);
  const east = new Uint8Array(2 * N);
  const south = new Uint8Array(2 * N);
  const rampLayer = new Int8Array(N).fill(-1);
  const upper = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const [x, z] = cellCenter(k);
    const r = rampAt(x, z);
    if (r) rampLayer[k] = r.layer;
    upper[k] = r || upperFloorAt(x, z) ? 1 : 0;
    open[k] = free(x, z, 0, NAV_CLEARANCE) ? 1 : 0;
    if (upper[k]) open[N + k] = free(x, z, 1, NAV_CLEARANCE) ? 1 : 0;
  }
  for (let layer = 0; layer < 2; layer++) {
    for (let k = 0; k < N; k++) {
      if (!open[layer * N + k]) continue;
      const [x, z] = cellCenter(k);
      if (k % NX < NX - 1 && (layer === 0 || upper[k + 1])) east[layer * N + k] = free(x + CELL / 2, z, layer, NAV_CLEARANCE) ? 1 : 0;
      if (k + NX < N && (layer === 0 || upper[k + NX])) south[layer * N + k] = free(x, z + CELL / 2, layer, NAV_CLEARANCE) ? 1 : 0;
    }
  }
  GRID_CACHE = { open, east, south, rampLayer };
  return GRID_CACHE;
}

// Whether the step between orthogonally adjacent cells a and b is clear on `layer`.
function step(g: Grid, layer: number, a: number, b: number) {
  const lo = Math.min(a, b);
  return (Math.abs(a - b) === 1 ? g.east : g.south)[layer * N + lo] === 1;
}

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

// Calls `visit` for each walkable neighbour of node (layer, k) with the layer the step lands on.
function eachNeighbour(layer: number, k: number, visit: (node: number, step: number) => void) {
  const g = walkable();
  const { open, rampLayer } = g;
  const cx = k % NX;
  const cz = Math.floor(k / NX);
  for (const [dx, dz, length] of DIRS) {
    const nx = cx + dx;
    const nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue;
    const nk = nz * NX + nx;
    const nl = rampLayer[nk] >= 0 ? rampLayer[nk] : rampLayer[k] >= 0 ? rampLayer[k] : layer;
    if (!open[nl * N + nk]) continue;
    if (!dx || !dz) {
      if (!step(g, nl, k, nk)) continue;
    } else {
      // A diagonal cuts the corner, so both ways around it must be clear.
      const sideX = cz * NX + nx;
      const sideZ = nz * NX + cx;
      if (!open[nl * N + sideX] || !open[nl * N + sideZ]) continue;
      if (!step(g, nl, k, sideX) || !step(g, nl, k, sideZ) || !step(g, nl, sideX, nk) || !step(g, nl, sideZ, nk)) continue;
    }
    visit(nl * N + nk, length * CELL);
  }
}

// Binary min-heap over node ids keyed by distance.
class Heap {
  ids: number[] = [];
  keys: number[] = [];

  get size() {
    return this.ids.length;
  }

  push(id: number, key: number) {
    let i = this.ids.length;
    this.ids.push(id);
    this.keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }

  pop(): [number, number] {
    const top: [number, number] = [this.ids[0], this.keys[0]];
    const id = this.ids.pop()!;
    const key = this.keys.pop()!;
    const n = this.ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const c = l + 1 < n && this.keys[l + 1] < this.keys[l] ? l + 1 : l;
        if (this.keys[c] >= key) break;
        this.ids[i] = this.ids[c];
        this.keys[i] = this.keys[c];
        i = c;
      }
      this.ids[i] = id;
      this.keys[i] = key;
    }
    return top;
  }
}

type CellTest = (layer: number, k: number) => boolean;

// Walking distance (hazard-weighted) from every node to the nearest goal: one search serves every walker.
// `blocked` closes cells for this search only, such as a doorway buried by rubble.
export function flowField(goal: CellTest, hazard: CellTest, blocked?: CellTest) {
  const { open } = walkable();
  // Float64 on purpose: rounding stored costs to float32 makes equal-cost paths look like improvements forever.
  const dist = new Float64Array(2 * N).fill(Infinity);
  const heap = new Heap();
  const shut = blocked ? new Uint8Array(2 * N) : null;
  if (shut && blocked) for (let node = 0; node < 2 * N; node++) shut[node] = open[node] && blocked(node >= N ? 1 : 0, node % N) ? 1 : 0;
  for (let node = 0; node < 2 * N; node++) {
    if (open[node] && !shut?.[node] && goal(node >= N ? 1 : 0, node % N)) {
      dist[node] = 0;
      heap.push(node, 0);
    }
  }
  while (heap.size) {
    const [node, d] = heap.pop();
    if (d > dist[node]) continue;
    eachNeighbour(node >= N ? 1 : 0, node % N, (next, step) => {
      if (shut?.[next]) return;
      const cost = d + step * (hazard(next >= N ? 1 : 0, next % N) ? HAZARD_COST : 1);
      if (cost < dist[next]) {
        dist[next] = cost;
        heap.push(next, cost);
      }
    });
  }
  return dist;
}

export type Waypoint = { x: number; z: number; layer: number };

// The neighbouring cell that is closest to a goal, or null at a goal or where none is reachable.
export function nextStep(dist: Float64Array, x: number, z: number, layer: number): Waypoint | null {
  const k = cellOf(x, z);
  let best = dist[layer * N + k];
  let to = -1;
  eachNeighbour(layer, k, (next) => {
    if (dist[next] < best) {
      best = dist[next];
      to = next;
    }
  });
  if (to < 0) return null;
  const [cx, cz] = cellCenter(to % N);
  return { x: cx, z: cz, layer: to >= N ? 1 : 0 };
}

export function distanceAt(dist: Float64Array, x: number, z: number, layer: number) {
  return dist[layer * N + cellOf(x, z)];
}

// Follows the field downhill; points carry their height for drawing the route.
export function routeFrom(dist: Float64Array, x: number, z: number, layer: number) {
  const pts: [number, number, number][] = [[x, groundY(x, z, layer), z]];
  let at: Waypoint = { x, z, layer };
  for (let i = 0; i < 4000; i++) {
    const next = nextStep(dist, at.x, at.z, at.layer);
    if (!next) break;
    at = next;
    pts.push([at.x, groundY(at.x, at.z, at.layer), at.z]);
  }
  return pts;
}

export const routeLength = (pts: [number, number, number][]) =>
  pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[2] - pts[i][2]), 0);

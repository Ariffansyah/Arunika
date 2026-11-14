import { MAPS, type Rect, type Setting } from "./maps.ts";

export type { Building, BuildingKind, Material } from "./maps.ts";

// The map is chosen once per page load, from ?peta= in the browser or PETA in tests, so every module that
// derives its layout from the grid when it loads sees the same campus. Switching maps reloads the page.
export const mapFromUrl = (search: string) => {
  const id = new URLSearchParams(search).get("peta");
  return id && id in MAPS ? (id as Setting) : "pesisir";
};
const wanted = typeof location !== "undefined" ? mapFromUrl(location.search) : (globalThis.process?.env?.PETA as Setting | undefined);
export const MAP = MAPS[wanted ?? "pesisir"] ?? MAPS.pesisir!;

export const GRID = MAP.grid;
export const W = GRID[0].length;
export const H = GRID.length;

// The world is built in metres; the grid stays the site plan.
export const TILE = 3;
export const SITE_W = W * TILE;
export const SITE_D = H * TILE;

export type Tile = [x: number, z: number];
export type Soil = "keras" | "sedang" | "lunak";

export const BUILDINGS = MAP.buildings;
export const ASSEMBLY_NAMES = MAP.assemblyNames;

export const BLOCKED_CHARS = "=-|TW123456";

export const tileAt = (x: number, z: number) => GRID[z]?.[x] ?? "=";
export const isBlocked = (x: number, z: number) => BLOCKED_CHARS.includes(tileAt(x, z));
export const idx = (x: number, z: number) => z * W + x;

export const tileCenter = (x: number, z: number): [number, number] => [(x + 0.5) * TILE, (z + 0.5) * TILE];

// x and z in metres.
export const elevationAt = (x: number, z: number) => MAP.elevation(x / TILE, z / TILE);

export const tileElevation = (x: number, z: number) => elevationAt(...tileCenter(x, z));

const inRect = (x: number, z: number, [x0, z0, x1, z1]: Rect) => x >= x0 && x <= x1 && z >= z0 && z <= z1;

// Paint only: collision and routing ignore surfaces.
export function surfaceAt(x: number, z: number): "paving" | "court" | "trail" | null {
  const c = tileAt(x, z);
  if (MAP.trail.some((r) => inRect(x, z, r))) return ".h".includes(c) ? "trail" : null;
  if (!".SW".includes(c)) return null;
  if (MAP.court && inRect(x, z, MAP.court)) return "court";
  return MAP.paving.some((r) => inRect(x, z, r)) ? "paving" : null;
}

export function findTiles(chars: string): Tile[] {
  const out: Tile[] = [];
  GRID.forEach((row, z) => [...row].forEach((c, x) => chars.includes(c) && out.push([x, z])));
  return out;
}

export function buildingRects() {
  const rects: Record<string, { x0: number; z0: number; x1: number; z1: number }> = {};
  for (const id of Object.keys(BUILDINGS)) {
    const tiles = findTiles(id);
    const xs = tiles.map((t) => t[0]);
    const zs = tiles.map((t) => t[1]);
    rects[id] = { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
  }
  return rects;
}

export const SPAWN = findTiles("S")[0];
export const WARDEN = findTiles("W")[0];
export const ASSEMBLY = findTiles("AB");
// Middle of the gate in metres; gates face south.
export const GATE: [number, number] = (() => {
  const g = findTiles("G");
  return [((Math.min(...g.map((t) => t[0])) + Math.max(...g.map((t) => t[0])) + 1) * TILE) / 2, (g[0][1] + 0.5) * TILE];
})();

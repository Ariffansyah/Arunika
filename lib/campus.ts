// North (row 0) is the hill side, south (row 27) faces the coast. Each character is a TILE-metre square.
//   = fence   . yard   h hill   g field   T tree   1-4 classroom blocks   5 canteen   6 musholla
//   A/B assembly points   S spawn   W warden NPC   G gate
export const GRID = [
  "========================================",
  "=............................hhhhhhhhhh=",
  "=............................hhhhhhhhhh=",
  "=..1111111111...33333333.....hhhhhhhhhh=",
  "=..1111111111...33333333.....hhhhhhhhhh=",
  "=..1111111111...33333333.....hhhhhAhhhh=",
  "=..1111111111...33333333.....hhhhhhhhhh=",
  "=............................hhhhhhhhhh=",
  "=.......S.....T..............hhhhhhhhhh=",
  "=.........................T..hhhhhhhhhh=",
  "=..2222222222................hhhhhhhhhh=",
  "=..2222222222.W........................=",
  "=..2222222222..........................=",
  "=..2222222222...gggggggggggg...T.......=",
  "=...............gggggggggggg...........=",
  "=...............gggggggggggg....6666.T.=",
  "=............T..gggggggggggg....6666...=",
  "=..444444.......gggggBgggggg....6666...=",
  "=..444444.......gggggggggggg....6666...=",
  "=..444444.......gggggggggggg...........=",
  "=..444444.......gggggggggggg..T........=",
  "=..444444.......gggggggggggg...........=",
  "=...............gggggggggggg...555555..=",
  "=..............................555555..=",
  "=.........T.................T..555555..=",
  "=......................................=",
  "=......................................=",
  "===================GG===================",
];

export const W = GRID[0].length;
export const H = GRID.length;

// The world is built in metres; the grid stays the site plan.
export const TILE = 3;
export const SITE_W = W * TILE;
export const SITE_D = H * TILE;

export type Tile = [x: number, z: number];
export type Material = "beton_bertulang" | "bata_tanpa_tulangan" | "kayu" | "baja_ringan";
export type Soil = "keras" | "sedang" | "lunak";

export type BuildingKind = "kelas" | "kantor" | "perpustakaan" | "kantin" | "musholla";

export type Building = {
  name: string;
  kind: BuildingKind;
  floors: number;
  // Undefined means the school's main material from its profile.
  material?: Material;
  yearOffset: number;
  // The face with the corridor or main doors.
  entrance: "N" | "S" | "E" | "W";
};

export const BUILDINGS: Record<string, Building> = {
  "1": { name: "Gedung Kelas A", kind: "kelas", floors: 2, yearOffset: 0, entrance: "S" },
  "2": { name: "Gedung Kelas B", kind: "kelas", floors: 1, material: "bata_tanpa_tulangan", yearOffset: -8, entrance: "N" },
  "3": { name: "Kantor Guru & TU", kind: "kantor", floors: 1, material: "beton_bertulang", yearOffset: 15, entrance: "S" },
  "4": { name: "Perpustakaan", kind: "perpustakaan", floors: 1, material: "kayu", yearOffset: -12, entrance: "E" },
  "5": { name: "Kantin", kind: "kantin", floors: 1, material: "baja_ringan", yearOffset: 6, entrance: "W" },
  "6": { name: "Musholla", kind: "musholla", floors: 1, material: "beton_bertulang", yearOffset: 10, entrance: "S" },
};

export const ASSEMBLY_NAMES: Record<string, string> = {
  A: "Titik Kumpul Bukit",
  B: "Titik Kumpul Lapangan",
};

export const BLOCKED_CHARS = "=TW123456";

export const tileAt = (x: number, z: number) => GRID[z]?.[x] ?? "=";
export const isBlocked = (x: number, z: number) => BLOCKED_CHARS.includes(tileAt(x, z));
export const idx = (x: number, z: number) => z * W + x;

export const tileCenter = (x: number, z: number): [number, number] => [(x + 0.5) * TILE, (z + 0.5) * TILE];

// x and z in metres. The hill is tall enough to stay dry in the worst flood and steep enough to slide.
export function elevationAt(x: number, z: number) {
  const tx = x / TILE;
  const tz = z / TILE;
  const slope = 0.1 + (H - 1 - tz) * 0.02;
  const hill = 8 * Math.exp(-((tx - 34.5) ** 2 + (tz - 5.5) ** 2) / 18);
  return slope + hill;
}

export const tileElevation = (x: number, z: number) => elevationAt(...tileCenter(x, z));

// Paint only: collision and routing ignore surfaces.
export function surfaceAt(x: number, z: number): "paving" | "court" | "trail" | null {
  const c = tileAt(x, z);
  // A worn track climbs from the courtyard to the hilltop assembly point.
  if ((z === 8 && x >= 28 && x <= 35) || (x === 35 && z >= 6 && z <= 7)) return ".h".includes(c) ? "trail" : null;
  if (!".SW".includes(c)) return null;
  if (x >= 24 && x <= 28 && z >= 1 && z <= 6) return "court";
  const courtyard = z >= 7 && z <= 9 && x >= 2 && x <= 27;
  const walkway = x >= 14 && x <= 15 && z >= 7 && z <= 26;
  const ceremonyYard = z >= 23 && z <= 26 && x >= 15 && x <= 26;
  // Paths to the doors of the library, the canteen and the musholla.
  const paths =
    (z === 19 && x >= 9 && x <= 13) ||
    (z === 23 && x >= 27 && x <= 31) ||
    (x === 34 && z >= 19 && z <= 21) ||
    (z === 21 && x >= 29 && x <= 33) ||
    (x === 29 && z === 22);
  return courtyard || walkway || ceremonyYard || paths ? "paving" : null;
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

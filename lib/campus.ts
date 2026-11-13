// One grid drives rendering, collision and evacuation routing.
// Row 0 is the north fence (hill side), row 27 the south fence facing the coast.
//   = fence   . yard   h hill   g field   T tree   1-4 buildings
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
  "=...............gggggggggggg........T..=",
  "=............T..gggggggggggg...........=",
  "=..444444.......gggggBgggggg...........=",
  "=..444444.......gggggggggggg...........=",
  "=..444444.......gggggggggggg...........=",
  "=..444444.......gggggggggggg.....T.....=",
  "=..444444.......gggggggggggg...........=",
  "=...............gggggggggggg...........=",
  "=......................................=",
  "=.........T.................T..........=",
  "=......................................=",
  "=......................................=",
  "===================GG===================",
];

export const W = GRID[0].length;
export const H = GRID.length;

export type Tile = [x: number, z: number];
export type Material = "beton_bertulang" | "bata_tanpa_tulangan" | "kayu" | "baja_ringan";
export type Soil = "keras" | "sedang" | "lunak";

export type Building = {
  name: string;
  floors: number;
  // Undefined means the school's main material from its profile.
  material?: Material;
  yearOffset: number;
};

export const BUILDINGS: Record<string, Building> = {
  "1": { name: "Gedung Kelas A", floors: 2, yearOffset: 0 },
  "2": { name: "Gedung Kelas B", floors: 1, material: "bata_tanpa_tulangan", yearOffset: -8 },
  "3": { name: "Kantor Guru & TU", floors: 1, material: "beton_bertulang", yearOffset: 15 },
  "4": { name: "Perpustakaan", floors: 1, material: "kayu", yearOffset: -12 },
};

export const ASSEMBLY_NAMES: Record<string, string> = {
  A: "Titik Kumpul Bukit",
  B: "Titik Kumpul Lapangan",
};

export const BLOCKED_CHARS = "=TW1234";

export const tileAt = (x: number, z: number) => GRID[z]?.[x] ?? "=";
export const isBlocked = (x: number, z: number) => BLOCKED_CHARS.includes(tileAt(x, z));
export const idx = (x: number, z: number) => z * W + x;

// Ground height in metres: a gentle slope up from the coast plus the hill in the north-east.
export function elevationAt(x: number, z: number) {
  const slope = 0.1 + (H - 1 - z) * 0.02;
  const hill = 3 * Math.exp(-((x - 34.5) ** 2 + (z - 5.5) ** 2) / 30);
  return slope + hill;
}

export const tileElevation = (x: number, z: number) => elevationAt(x + 0.5, z + 0.5);

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

// The campuses a drill can run on. Each character of a grid is a 3 m square; north (row 0) is up.
//   = fence   - | low railing (along x, along z)   . yard   h hill   g field   T tree   1-4 classroom blocks   5 canteen   6 musholla
//   A/B assembly points   S spawn   W warden NPC   G gate
// Every map keeps each building's footprint, so the floor plans (lib/floorplan.ts) fit any of them.

export type Material = "beton_bertulang" | "bata_tanpa_tulangan" | "kayu" | "baja_ringan";
export type BuildingKind = "kelas" | "kantor" | "perpustakaan" | "kantin" | "musholla";
export type Kind = "gempa" | "banjir" | "angin" | "longsor";

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

// Inclusive tile rectangle.
export type Rect = [x0: number, z0: number, x1: number, z1: number];
// Where a slope would slide, in metres: from (ax, az) above to (bx, bz) below, r wide either side,
// with the three warning signs (crack, leaning tree, muddy spring) in the order they appear.
export type Runout = { ax: number; az: number; bx: number; bz: number; r: number; signs: [number, number][] };
export type Setting = "pesisir" | "pegunungan" | "kota";

export type CampusMap = {
  id: Setting;
  name: string;
  grid: string[];
  buildings: Record<string, Building>;
  assemblyNames: Record<string, string>;
  // Ground height in metres at a point given in tiles.
  elevation: (tx: number, tz: number) => number;
  paving: Rect[];
  court: Rect | null;
  trail: Rect[];
  runouts: Runout[];
  disasters: Kind[];
  floodLabel: string;
  // Metres: benches with their turn, waste bins, the water tower and the flagpole.
  decor: { benches: [number, number, number][]; bins: [number, number][]; waterTower: [number, number]; flag: [number, number] };
};

const BUILDINGS: Record<string, Building> = {
  "1": { name: "Gedung Kelas A", kind: "kelas", floors: 2, yearOffset: 0, entrance: "S" },
  "2": { name: "Gedung Kelas B", kind: "kelas", floors: 1, material: "bata_tanpa_tulangan", yearOffset: -8, entrance: "N" },
  "3": { name: "Kantor Guru & TU", kind: "kantor", floors: 1, material: "beton_bertulang", yearOffset: 15, entrance: "S" },
  "4": { name: "Perpustakaan", kind: "perpustakaan", floors: 1, material: "kayu", yearOffset: -12, entrance: "E" },
  "5": { name: "Kantin", kind: "kantin", floors: 1, material: "baja_ringan", yearOffset: 6, entrance: "W" },
  "6": { name: "Musholla", kind: "musholla", floors: 1, material: "beton_bertulang", yearOffset: 10, entrance: "S" },
};

// A school by the sea: the hill in the north-east is the refuge from a tidal flood, and its west face can slide.
const pesisir: CampusMap = {
  id: "pesisir",
  name: "Pesisir",
  grid: [
    "========================================",
    "=............................|hhhhhhhhh=",
    "=............................|hhhhhhhhh=",
    "=..1111111111...33333333.....|hhhhhhhhh=",
    "=..1111111111...33333333.....|hhhhhhhhh=",
    "=..1111111111...33333333.....|hhhhAhhhh=",
    "=..1111111111...33333333.....|hhhhhhhhh=",
    "=............................|hhhhhhhhh=",
    "=.......S.....T..............hhhhhhhhhh=",
    "=.........................T..|hhhhhhhhh=",
    "=..2222222222................|hhhhhhhhh=",
    "=..2222222222.W..............----------=",
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
  ],
  buildings: BUILDINGS,
  assemblyNames: { A: "Titik Kumpul Bukit", B: "Titik Kumpul Lapangan" },
  // Falls gently to the coast in the south; the hill is tall enough to stay dry in the worst flood and steep enough to slide.
  elevation: (tx, tz) => 0.1 + (27 - tz) * 0.02 + 8 * Math.exp(-((tx - 34.5) ** 2 + (tz - 5.5) ** 2) / 18),
  paving: [
    [2, 7, 27, 9],
    [14, 7, 15, 26],
    [15, 23, 26, 26],
    // Paths to the doors of the library, the canteen and the musholla.
    [9, 19, 13, 19],
    [27, 23, 31, 23],
    [34, 19, 34, 21],
    [29, 21, 33, 21],
    [29, 22, 29, 22],
  ],
  court: [24, 1, 28, 6],
  // A worn track climbs from the courtyard to the hilltop assembly point.
  trail: [
    [28, 8, 35, 8],
    [35, 6, 35, 7],
  ],
  runouts: [{ ax: 110, az: 15, bx: 74, bz: 15, r: 14, signs: [[88, 9], [92, 22], [84, 16]] }],
  disasters: ["gempa", "banjir", "angin", "longsor"],
  floodLabel: "Banjir Rob",
  decor: {
    benches: [
      [34.8, 45.9, 0],
      [31.5, 69.3, 0],
      [75.9, 30.6, 0],
      [88.8, 64.8, Math.PI / 2],
    ],
    bins: [
      [90, 76.8],
      [7.8, 25.2],
    ],
    waterTower: [112.8, 76.8],
    flag: [61.5, 73.5],
  },
};

export const MAPS: Partial<Record<Setting, CampusMap>> = { pesisir };

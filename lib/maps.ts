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
    "=....T....T......T...T.......|hhhhhhhhh=",
    "=............................|hThhhhhTh=",
    "=..1111111111...33333333.....|hhhhhhhhh=",
    "=..1111111111...33333333.....|hhhhhhhhh=",
    "=..1111111111...33333333.....|hhhhAhhhh=",
    "=..1111111111...33333333.....|hhhhhhhhT=",
    "=............................|hThhhhhhh=",
    "=.......S.....T..............hhhhhhhhhh=",
    "=.........................T..|hhhhhhhTh=",
    "=..2222222222................|hhThhhhhh=",
    "=..2222222222.W..............----------=",
    "=..2222222222..........T............T..=",
    "=..2222222222...gggggggggggg...T.......=",
    "=...............gggggggggggg...........=",
    "=...............ggggggggggggT...6666.T.=",
    "=............T..gggggggggggg....6666...=",
    "=..444444.......gggggBgggggg....6666...=",
    "=..444444.......ggggggggggggT...6666...=",
    "=..444444.......gggggggggggg..........T=",
    "=..444444....T..gggggggggggg..T........=",
    "=..444444.......gggggggggggg...........=",
    "=...............gggggggggggg...555555..=",
    "=..............................555555..=",
    "=.........T.................T..555555.T=",
    "=......................................=",
    "=.T...T............................T...=",
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

// A school on a mountainside: a steep spur in the north-west is the high ground and can slide two ways,
// and a flash flood comes up the valley from the river to the south.
const pegunungan: CampusMap = {
  id: "pegunungan",
  name: "Pegunungan",
  grid: [
    "========================================",
    "=hhhThhhhhhhh|.............T...........=",
    "=hThhhhhhThhh|..1111111111..33333333.T.=",
    "=hhhhhhhhhhhh|..1111111111..33333333...=",
    "=hhhhhAhhhhhh|..1111111111..33333333...=",
    "=hThhhhhhThhh|..1111111111..33333333...=",
    "=hhhhhhhhhhTh|.........................=",
    "=hhhhhhhhhhhhh.S.......................=",
    "=hhThhhhhhThh|.......................T.=",
    "=hhhhhhhhhhhh|..2222222222.............=",
    "=-------------..2222222222.............=",
    "=......T........2222222222.............=",
    "=.T........T..W.2222222222............T=",
    "=..444444...................T..6666....=",
    "=..444444.....T.............T..6666....=",
    "=..444444.......gggggggggggg...6666....=",
    "=T.444444.......gggggggggggg...6666....=",
    "=..444444....T..gggggggggggg.........T.=",
    "=...............gggggggggggg.T.........=",
    "=...............gggggBgggggg...........=",
    "=.T.............gggggggggggg...555555..=",
    "=.........T..T..gggggggggggg...555555..=",
    "=...............gggggggggggg...555555..=",
    "=...............gggggggggggg..........T=",
    "=....T......................T.....T....=",
    "=........T...............T..........T..=",
    "=.T.........T.................T........=",
    "===================GG===================",
  ],
  buildings: BUILDINGS,
  assemblyNames: { A: "Titik Kumpul Bukit", B: "Titik Kumpul Lapangan" },
  // The valley floor rises northwards; the spur is a steep cone in the corner, clear of every building.
  elevation: (tx, tz) => 0.3 + (27 - tz) * 0.04 + 9 * Math.exp(-((tx - 6.5) ** 2 / 14 + (tz - 4.5) ** 2 / 10)),
  paving: [
    [14, 6, 37, 7],
    [14, 6, 15, 26],
    [15, 24, 27, 26],
    [9, 15, 13, 15],
    [16, 8, 25, 8],
    [28, 17, 34, 17],
    [28, 21, 30, 21],
  ],
  court: [29, 8, 33, 12],
  trail: [
    [7, 7, 14, 7],
    [7, 5, 7, 6],
  ],
  runouts: [
    { ax: 31, az: 12, bx: 64, bz: 15, r: 8, signs: [[36, 9], [36, 18], [38, 13.5]] },
    { ax: 19.5, az: 23, bx: 19.5, bz: 54, r: 8, signs: [[16, 27], [24, 28], [19.5, 29.5]] },
  ],
  disasters: ["gempa", "banjir", "angin", "longsor"],
  floodLabel: "Banjir Bandang",
  decor: {
    benches: [
      [33, 42, 0],
      [87, 45, Math.PI / 2],
      [55.5, 78, 0],
      [110, 33, Math.PI / 2],
    ],
    bins: [
      [45, 75],
      [112, 54],
    ],
    waterTower: [106.5, 76.5],
    flag: [64.5, 73.5],
  },
};

// A school in a low-lying city block: flat and crowded, so a flood is sat out upstairs and a railing rings the field.
const kota: CampusMap = {
  id: "kota",
  name: "Kota",
  grid: [
    "========================================",
    "=......................T...T...........=",
    "=.1111111111..33333333........444444.T.=",
    "=.1111111111..33333333........444444...=",
    "=.1111111111..33333333........444444...=",
    "=.1111111111..33333333........444444...=",
    "=.............................444444...=",
    "=...........S..........................=",
    "=.............................T........=",
    "=.2222....|gggggggggggggg|..T........T.=",
    "=.2222..T.|gggggggggggggg|.....6666....=",
    "=.2222....|gggggggggggggg|.....6666....=",
    "=.2222....|gggggggggggggg|..T..6666....=",
    "=.2222.....ggggggBggggggg......6666....=",
    "=.2222.....gggggggggggggg............T.=",
    "=.2222....|gggggggggggggg|.............=",
    "=.2222..T.|gggggggggggggg|.............=",
    "=.2222....|gggggggggggggg|........555..=",
    "=.2222....|gggggggggggggg|........555.T=",
    "=.........-------..-------........555..=",
    "=.......T....T....................555..=",
    "=.T..........W.T...T...T..........555..=",
    "=.................................555.T=",
    "=......................................=",
    "=.....A........................T.......=",
    "=.T..............................T...T.=",
    "=.....T................................=",
    "===================GG===================",
  ],
  buildings: { ...BUILDINGS, "2": { ...BUILDINGS["2"], entrance: "E" }, "4": { ...BUILDINGS["4"], entrance: "W" }, "5": { ...BUILDINGS["5"], entrance: "N" } },
  assemblyNames: { A: "Titik Kumpul Depan", B: "Titik Kumpul Lapangan" },
  elevation: (tx, tz) => 0.3 + (27 - tz) * 0.006,
  paving: [
    [2, 6, 29, 8],
    [29, 2, 29, 6],
    [26, 8, 27, 26],
    [8, 22, 30, 26],
    [6, 9, 6, 21],
    [28, 14, 34, 14],
    [28, 16, 36, 16],
  ],
  court: [28, 17, 32, 21],
  trail: [],
  runouts: [],
  disasters: ["gempa", "banjir", "angin"],
  floodLabel: "Banjir",
  decor: {
    benches: [
      [22.5, 70.5, 0],
      [96, 64.5, 0],
      [79.5, 30, Math.PI / 2],
    ],
    bins: [
      [87, 75],
      [12, 63],
    ],
    waterTower: [112.5, 49.5],
    flag: [61.5, 70.5],
  },
};

export const MAPS: Partial<Record<Setting, CampusMap>> = { pesisir, pegunungan, kota };

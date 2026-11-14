import { ASSEMBLY, MAP, TILE, elevationAt, findTiles, surfaceAt, tileCenter, type Tile } from "./campus.ts";
import { PLAN, classrooms, type Room } from "./floorplan.ts";
import { free } from "./nav.ts";
import { random, type Scenario } from "./sim.ts";

export type Place = "kelas" | "perpustakaan" | "kantin" | "musholla" | "lapangan";

// Where a drill starts and what has gone wrong on the way out, drawn from the drill's seed so every
// player in a room gets the same situation. Hidden trouble is found on the ground, not announced.
export type Situation = {
  place: Place;
  // The room everyone starts in, or null on the field.
  room: Room | null;
  brief: string;
  // Standing places in the start room or on the field, as x, z, facing; classrooms use their seats instead.
  spots: [number, number, number][];
  // A tree down across a path: its centre and the axis it lies along. Low enough to climb over.
  fallen: { x: number; z: number; along: "x" | "z"; at: "shake" | "wind" } | null;
  // An assembly point made unsafe by a fallen power pole.
  closedGoal: Tile | null;
  // A whirlwind shelter whose door is jammed shut.
  lockedRoom: string | null;
  // Which slide lane of the map gives way.
  lane: number;
};

const PLACES: [Place, number][] = [
  ["kelas", 0.5],
  ["perpustakaan", 0.13],
  ["kantin", 0.14],
  ["musholla", 0.1],
  ["lapangan", 0.13],
];

const BRIEF: Record<Exclude<Place, "kelas">, string> = {
  perpustakaan: "Jam istirahat. Kamu di perpustakaan.",
  kantin: "Jam istirahat. Kamu di kantin.",
  musholla: "Salat Zuhur di musholla.",
  lapangan: "Pelajaran olahraga di lapangan.",
};

// Open places across a room or the field, every 1.2 m, clear of furniture and walls.
function openSpots(rnd: () => number, room: Room | null): [number, number, number][] {
  const [x0, z0, x1, z1] = room
    ? [room.x0 + 0.6, room.z0 + 0.6, room.x1 - 0.6, room.z1 - 0.6]
    : (() => {
        const g = findTiles("g");
        const xs = g.map((t) => t[0]);
        const zs = g.map((t) => t[1]);
        return [Math.min(...xs) * TILE + 2, Math.min(...zs) * TILE + 2, (Math.max(...xs) + 1) * TILE - 2, (Math.max(...zs) + 1) * TILE - 2];
      })();
  const layer = room?.floor ?? 0;
  const out: [number, number, number][] = [];
  // On the field nobody starts already standing at the assembly point.
  const away = (x: number, z: number) => room || ASSEMBLY.every((a) => Math.hypot(...tileCenter(...a).map((v, i) => v - [x, z][i])) > 8);
  for (let z = z0; z <= z1; z += 1.2) for (let x = x0; x <= x1; x += 1.2) if (free(x, z, layer, 0.35) && away(x, z)) out.push([x, z, rnd() * Math.PI * 2]);
  // Shuffled with the seed, so classmates and players spread over the room instead of filling it row by row.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Trees next to a paved path, each with the path tile it would fall across.
const TOPPLE = findTiles("T").flatMap(([x, z]) =>
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .filter(([dx, dz]) => surfaceAt(x + dx, z + dz) === "paving")
    .map(([dx, dz]) => ({ tile: [x + dx, z + dz] as Tile, along: (dx ? "x" : "z") as "x" | "z" })),
);

export function situation(s: Scenario, seed: number): Situation {
  // Its own stream, so the timeline drawn from the same seed is untouched.
  const rnd = random(seed ^ 0x5bd1e995);
  let r = rnd();
  const place = PLACES.find(([, w]) => (r -= w) < 0)?.[0] ?? "kelas";
  const room =
    place === "kelas"
      ? classrooms()[Math.floor(rnd() * classrooms().length)]
      : place === "lapangan"
        ? null
        : PLAN.rooms.find((q) => q.kind === place)!;
  const quake = s.kind === "gempa";
  const topple = (quake && s.intensity >= 6 && rnd() < 0.6) || (s.kind === "angin" && rnd() < 0.8) ? TOPPLE[Math.floor(rnd() * TOPPLE.length)] : undefined;
  const fallen = topple ? { x: tileCenter(...topple.tile)[0], z: tileCenter(...topple.tile)[1], along: topple.along, at: quake ? ("shake" as const) : ("wind" as const) } : null;
  const closedGoal = quake && ASSEMBLY.length > 1 && rnd() < 0.35 ? ASSEMBLY[Math.floor(rnd() * ASSEMBLY.length)] : null;
  const shelters = PLAN.rooms.filter((q) => q.shelter);
  const lockedRoom = s.kind === "angin" && rnd() < 0.5 ? shelters[Math.floor(rnd() * shelters.length)].id : null;
  return {
    place,
    room,
    brief: place === "kelas" ? `Pelajaran di ${room!.name}.` : BRIEF[place],
    spots: place === "kelas" ? [] : openSpots(rnd, room),
    fallen,
    closedGoal,
    lockedRoom,
    lane: MAP.runouts.length ? Math.floor(rnd() * MAP.runouts.length) : 0,
  };
}

// The trunk as a box: across the whole path tile, knee high, so it can be climbed over but not walked through.
export function fallenBox(f: NonNullable<Situation["fallen"]>) {
  const [hx, hz] = f.along === "x" ? [2.6, 0.35] : [0.35, 2.6];
  const y = elevationAt(f.x, f.z);
  return { x0: f.x - hx, x1: f.x + hx, z0: f.z - hz, z1: f.z + hz, y0: y - 0.5, y1: y + 0.7 };
}

export const outdoors = (sit: Situation) => sit.place === "lapangan";

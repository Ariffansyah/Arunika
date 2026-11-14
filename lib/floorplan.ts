import { BUILDINGS, TILE, buildingRects, tileElevation } from "./campus.ts";

// Real school dimensions in metres.
export const STOREY = 4;
export const SLAB = 0.2;
export const PLINTH = 0.3;
export const WALL = 0.15;
export const CORRIDOR = 2.5;
export const CEILING = STOREY - SLAB;
const DOOR_W = 1;
const DOOR_H = 2.1;
const SILL = 0.9;
const HEAD = 2.1;

export type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
// `floor` is the storey a part belongs to; a building's ceiling and roof sit in the storey above its top floor.
export type Part = Box & { kind: PartKind; b: string; floor: number; color?: string };
export type PartKind = "wall" | "glass" | "floor" | "column" | "rail" | "step" | "board" | "trim" | "under" | "roof";
export type RoomKind = "kelas" | "selasar" | "tangga" | "wc" | "guru" | "tu" | "kepsek" | "perpustakaan" | "kantin" | "dapur" | "musholla";
export type Room = { id: string; b: string; floor: number; kind: RoomKind; name: string; x0: number; z0: number; x1: number; z1: number };
// `out` points from the room side through the doorway.
export type Door = { id: string; b: string; floor: number; x: number; z: number; along: "x" | "z"; w: number; y: number; out: [number, number] };
export type Pane = { b: string; floor: number; x: number; z: number; along: "x" | "z"; w: number; y0: number; y1: number };
export type Furniture =
  | "desk"
  | "chair"
  | "chairDesk"
  | "table"
  | "bench"
  | "bookcaseClosedDoors"
  | "bookcaseOpen"
  | "books"
  | "ceilingFan"
  | "lampSquareCeiling"
  | "kitchenStove"
  | "kitchenCabinet"
  | "kitchenFridge"
  | "kitchenSink"
  | "kitchenBar"
  | "toilet"
  | "bathroomSink"
  | "rugRectangle"
  | "trashcan"
  | "computerScreen"
  | "sideTableDrawers"
  | "pottedPlant"
  | "speaker";
// size is [width across the facing direction, height, depth along it]; ry turns +z to the facing direction.
export type Item = { model: Furniture; b: string; floor: number; x: number; y: number; z: number; ry: number; size: [number, number, number]; solid: boolean };
export type Seat = { room: string; x: number; z: number; ry: number };
// Height runs linearly from y0 at c0 to y1 at c1 along `axis`; a walker on it is on `layer`.
export type Ramp = { b: string; layer: 0 | 1; x0: number; x1: number; z0: number; z1: number; axis: "x" | "z"; c0: number; c1: number; y0: number; y1: number };
export type Spot = { kind: "peta" | "mcb" | "gas" | "kentongan"; b: string; floor: number; x: number; y: number; z: number; ry: number };
export type Plan = {
  parts: Part[];
  rooms: Room[];
  doors: Door[];
  panes: Pane[];
  items: Item[];
  seats: Seat[];
  ramps: Ramp[];
  spots: Spot[];
  base: Record<string, number>;
  floorY: Record<string, number>;
  footprint: Record<string, { x0: number; z0: number; x1: number; z1: number }>;
};

// u runs along the entrance face, v from that face into the building.
type Frame = { ox: number; oz: number; ux: number; uz: number; vx: number; vz: number; L: number; D: number };

function frame(b: string): Frame {
  const r = buildingRects()[b];
  const [x0, z0, x1, z1] = [r.x0 * TILE, r.z0 * TILE, (r.x1 + 1) * TILE, (r.z1 + 1) * TILE];
  const [w, d] = [x1 - x0, z1 - z0];
  switch (BUILDINGS[b].entrance) {
    case "S":
      return { ox: x0, oz: z1, ux: 1, uz: 0, vx: 0, vz: -1, L: w, D: d };
    case "N":
      return { ox: x0, oz: z0, ux: 1, uz: 0, vx: 0, vz: 1, L: w, D: d };
    case "E":
      return { ox: x1, oz: z0, ux: 0, uz: 1, vx: -1, vz: 0, L: d, D: w };
    case "W":
      return { ox: x0, oz: z0, ux: 0, uz: 1, vx: 1, vz: 0, L: d, D: w };
  }
}

const pt = (F: Frame, u: number, v: number): [number, number] => [F.ox + u * F.ux + v * F.vx, F.oz + u * F.uz + v * F.vz];
const yaw = (F: Frame, du: number, dv: number) => Math.atan2(du * F.ux + dv * F.vx, du * F.uz + dv * F.vz);
const alongU = (F: Frame): "x" | "z" => (F.ux !== 0 ? "x" : "z");
const alongV = (F: Frame): "x" | "z" => (F.vx !== 0 ? "x" : "z");

function area(F: Frame, u0: number, u1: number, v0: number, v1: number) {
  const [ax, az] = pt(F, u0, v0);
  const [bx, bz] = pt(F, u1, v1);
  return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
}

type Hole = { at: number; w: number; sill: number; top: number; glass?: boolean; door?: boolean };
const win = (at: number, w = 1.4): Hole => ({ at, w, sill: SILL, top: HEAD, glass: true });
const high = (at: number, w = 0.8): Hole => ({ at, w, sill: 1.6, top: HEAD, glass: true });
const door = (at: number, w = DOOR_W): Hole => ({ at, w, sill: 0, top: DOOR_H, door: true });
const gap = (at: number, w: number): Hole => ({ at, w, sill: 0, top: DOOR_H + 0.3 });
const hatch = (at: number, w: number): Hole => ({ at, w, sill: 0.95, top: HEAD });

// One building storey being laid out: y0 is its floor surface, y1 the top of its walls.
class Storey {
  plan: Plan;
  F: Frame;
  b: string;
  floor: number;
  y0: number;
  y1: number;

  constructor(plan: Plan, F: Frame, b: string, floor: number, y0: number, y1: number) {
    this.plan = plan;
    this.F = F;
    this.b = b;
    this.floor = floor;
    this.y0 = y0;
    this.y1 = y1;
  }

  box(kind: PartKind, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color?: string, floor = this.floor) {
    this.plan.parts.push({ kind, b: this.b, floor, ...area(this.F, u0, u1, v0, v1), y0, y1, ...(color ? { color } : {}) });
  }

  // A straight wall along u ("u") or along v ("v"), split around its openings.
  wall(axis: "u" | "v", a0: number, a1: number, c0: number, c1: number, holes: Hole[] = [], top = this.y1, room?: [number, number]) {
    const put = (kind: PartKind, s: number, e: number, y0: number, y1: number, cs = c0, ce = c1) =>
      axis === "u" ? this.box(kind, s, e, cs, ce, y0, y1) : this.box(kind, cs, ce, s, e, y0, y1);
    const along = axis === "u" ? alongU(this.F) : alongV(this.F);
    let cur = a0;
    for (const h of [...holes].sort((p, q) => p.at - q.at)) {
      const s = h.at - h.w / 2;
      const e = h.at + h.w / 2;
      if (s > cur) put("wall", cur, s, this.y0, top);
      if (h.sill > 0) put("wall", s, e, this.y0, this.y0 + h.sill);
      if (this.y0 + h.top < top) put("wall", s, e, this.y0 + h.top, top);
      const mid = (c0 + c1) / 2;
      const [x, z] = axis === "u" ? pt(this.F, h.at, mid) : pt(this.F, mid, h.at);
      if (h.glass) {
        put("glass", s, e, this.y0 + h.sill, this.y0 + h.top, mid - 0.015, mid + 0.015);
        this.plan.panes.push({ b: this.b, floor: this.floor, x, z, along, w: h.w, y0: this.y0 + h.sill, y1: this.y0 + h.top });
      }
      if (h.door && room) {
        // `room` gives the side the door belongs to as a point; the door opens away from it.
        const [rx, rz] = pt(this.F, ...room);
        const out: [number, number] = along === "x" ? [0, Math.sign(z - rz) || 1] : [Math.sign(x - rx) || 1, 0];
        this.plan.doors.push({ id: `${this.b}-${this.floor}-${this.plan.doors.length}`, b: this.b, floor: this.floor, x, z, along, w: h.w, y: this.y0, out });
      }
      cur = e;
    }
    if (cur < a1) put("wall", cur, a1, this.y0, top);
  }

  room(kind: RoomKind, name: string, u0: number, u1: number, v0: number, v1: number) {
    const id = `${this.b}-${this.floor}-${this.plan.rooms.length}`;
    this.plan.rooms.push({ id, b: this.b, floor: this.floor, kind, name, ...area(this.F, u0, u1, v0, v1) });
    return id;
  }

  // Facing is a direction in the building frame (du, dv).
  item(model: Furniture, u: number, v: number, du: number, dv: number, size: [number, number, number], solid = true, lift = 0) {
    const [x, z] = pt(this.F, u, v);
    this.plan.items.push({ model, b: this.b, floor: this.floor, x, y: this.y0 + lift, z, ry: yaw(this.F, du, dv), size, solid });
  }

  spot(kind: Spot["kind"], u: number, v: number, du: number, dv: number, lift: number) {
    const [x, z] = pt(this.F, u, v);
    this.plan.spots.push({ kind, b: this.b, floor: this.floor, x, y: this.y0 + lift, z, ry: yaw(this.F, du, dv) });
  }

  columns(L: number, v0: number, v1: number, every = 4.5) {
    const n = Math.max(2, Math.round(L / every));
    for (let i = 0; i <= n; i++) {
      const u = WALL + ((L - 2 * WALL) * i) / n;
      this.box("column", u - 0.15, u + 0.15, v0, v1, this.y0, this.y1);
    }
  }
}

const CLASS_NAMES: Record<string, string[][]> = {
  "1": [
    ["Kelas 7A", "Kelas 7B", "Kelas 7C"],
    ["Kelas 8A", "Kelas 8B", "Kelas 8C"],
  ],
  "2": [["Kelas 9A", "Kelas 9B", "Kelas 9C"]],
};

function classroom(s: Storey, u0: number, name: string) {
  const vIn = CORRIDOR + WALL;
  const id = s.room("kelas", name, u0, u0 + 9, vIn, s.F.D - WALL);
  const front = u0 + (u0 === 0 ? WALL : WALL / 2);
  s.box("board", front, front + 0.04, 5.45, 9.05, s.y0 + 0.9, s.y0 + 2.1);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const u = u0 + 3.3 + row * 1.4;
      const v = 3.9 + col * 2.2;
      s.item("desk", u, v, -1, 0, [1.2, 0.75, 0.5]);
      for (const dv of [-0.3, 0.3]) {
        s.item("chair", u + 0.55, v + dv, -1, 0, [0.42, 0.85, 0.42], false);
        const [x, z] = pt(s.F, u + 0.55, v + dv);
        s.plan.seats.push({ room: id, x, z, ry: yaw(s.F, -1, 0) });
      }
    }
  }
  s.item("table", u0 + 2, 4.4, 1, 0, [1.4, 0.75, 0.7]);
  s.item("chairDesk", u0 + 1.3, 4.4, 1, 0, [0.6, 0.95, 0.6], false);
  s.item("bookcaseClosedDoors", front + 0.25, 10.6, 1, 0, [1, 1.8, 0.45]);
  s.item("trashcan", u0 + 8.4, 3.2, 0, 1, [0.4, 0.55, 0.4], false);
  for (const u of [u0 + 3.6, u0 + 6.6]) s.item("ceilingFan", u, 7.2, 0, 1, [1.3, 0.4, 1.3], false, CEILING - 0.4);
  for (const v of [4.8, 9.6]) s.item("lampSquareCeiling", u0 + 4.8, v, 0, 1, [0.3, 0.5, 0.3], false, CEILING - 0.5);
  s.spot("peta", u0 + 2.6, vIn + 0.02, 0, 1, 1.5);
}

function kelas(plan: Plan, F: Frame, b: string, y00: number, base: number) {
  const { L, D } = F;
  const floors = BUILDINGS[b].floors;
  const stairs = floors > 1;
  const vIn = CORRIDOR + WALL;
  const end = 27;
  // U-shaped stairs in the end bay: flight A climbs away from the corridor, flight B comes back up to the next floor.
  const [uA0, uA1, uB0, uB1] = [end + WALL / 2, 28.4, 28.55, L - WALL];
  const [vF0, vF1, vBack] = [vIn + 1.5, vIn + 6, D - WALL];
  for (let f = 0; f < floors; f++) {
    const y0 = y00 + f * STOREY;
    const s = new Storey(plan, F, b, f, y0, y0 + CEILING);
    if (f > 0) {
      s.box("floor", 0, uA0, 0, D, y0 - SLAB, y0);
      s.box("floor", uA0, L, 0, vIn, y0 - SLAB, y0);
      s.box("floor", uB0, uB1, vIn, vF0, y0 - SLAB, y0);
      s.box("rail", 0, L, 0, 0.06, y0, y0 + 1);
      s.box("rail", 0, 0.06, 0, CORRIDOR, y0, y0 + 1);
      s.box("rail", L - 0.06, L, 0, CORRIDOR, y0, y0 + 1);
    }
    s.room("selasar", "Selasar", 0, L, 0, CORRIDOR);
    s.columns(L, 0, 0.3);
    s.wall("u", 0, L, D - WALL, D, [0, 9, 18].flatMap((u0) => [win(u0 + 1.8), win(u0 + 4.5), win(u0 + 7.2)]).concat(stairs ? [] : [high(end + 1.5)]));
    s.wall("v", CORRIDOR, D - WALL, 0, WALL);
    s.wall("v", CORRIDOR, D - WALL, L - WALL, L);
    const front: Hole[] = [0, 9, 18].flatMap((u0) => [door(u0 + 1), win(u0 + 4.5, 2), door(u0 + 8)]);
    if (stairs) front.push(gap(f === 0 ? (uA0 + uA1) / 2 : (uB0 + uB1) / 2, 1.1));
    else front.push(door(end + 1.5));
    s.wall("u", 0, L, CORRIDOR, vIn, front, s.y1, [1, 6]);
    for (const u of [9, 18, end]) s.wall("v", vIn, D - WALL, u - WALL / 2, u + WALL / 2);
    CLASS_NAMES[b][f].forEach((name, i) => classroom(s, i * 9, name));
    if (stairs) s.room("tangga", "Tangga", end, L, vIn, D);
    else {
      s.room("wc", "Toilet", end, L, vIn, D);
      for (const u of [27.8, 29.1]) s.item("toilet", u, 11.25, 0, -1, [0.5, 0.8, 0.7]);
      s.item("bathroomSink", 29.45, 4, -1, 0, [0.55, 0.9, 0.45]);
    }
  }
  if (stairs) {
    const s = new Storey(plan, F, b, 0, y00, y00 + CEILING);
    const top = y00 + STOREY;
    const run = vF1 - vF0;
    const rise = STOREY / 2 / 12;
    s.box("wall", uA1, uB0, vIn, vF1, y00, top + 1);
    s.box("under", uB0, uB1, vF0, vF1, base, y00 + 1.9);
    s.box("under", uA0, uB1, vF1, vBack, base, y00 + 1.9);
    for (let k = 0; k < 12; k++) {
      s.box("step", uA0, uA1, vF0 + (k * run) / 12, vF0 + ((k + 1) * run) / 12, y00, y00 + (k + 1) * rise);
      s.box("step", uB0, uB1, vF1 - ((k + 1) * run) / 12, vF1 - (k * run) / 12, y00 + 2 + k * rise - 0.25, y00 + 2 + (k + 1) * rise);
    }
    s.box("step", uA0, uB1, vF1, vBack, y00 + 1.8, y00 + 2);
    const ramp = (layer: 0 | 1, u0: number, u1: number, v0: number, v1: number, ya: number, yb: number) => {
      const axis = alongV(F);
      const [c0, c1] = [pt(F, u0, v0), pt(F, u0, v1)].map((p) => (axis === "x" ? p[0] : p[1]));
      plan.ramps.push({ b, layer, ...area(F, u0, u1, v0, v1), axis, c0, c1, y0: ya, y1: yb });
    };
    ramp(0, uA0, uA1, vF0, vF1, y00, y00 + 2);
    ramp(0, uA0, uB1, vF1, vBack, y00 + 2, y00 + 2);
    ramp(1, uB0, uB1, vF0, vF1, top, y00 + 2);
  }
}

function kantor(plan: Plan, F: Frame, b: string, y00: number) {
  const { L, D } = F;
  const vIn = CORRIDOR + WALL;
  const s = new Storey(plan, F, b, 0, y00, y00 + CEILING);
  s.room("selasar", "Selasar", 0, L, 0, CORRIDOR);
  s.columns(L, 0, 0.3);
  s.wall("u", 0, L, D - WALL, D, [win(2), win(6), win(10), win(15), win(21)]);
  s.wall("v", CORRIDOR, D - WALL, 0, WALL);
  s.wall("v", CORRIDOR, D - WALL, L - WALL, L);
  s.wall("u", 0, L, CORRIDOR, vIn, [door(1.3), win(4.5), win(7.5), door(10.7), door(13.2), win(16), door(19.2), win(22)], s.y1, [6, 6]);
  for (const u of [12, 18]) s.wall("v", vIn, D - WALL, u - WALL / 2, u + WALL / 2);

  s.room("guru", "Ruang Guru", 0, 12, vIn, D - WALL);
  for (const v of [5, 8.5]) {
    for (const u of [2.5, 5, 7.5, 10]) {
      s.item("desk", u, v, 0, -1, [1.2, 0.75, 0.6]);
      s.item("chairDesk", u, v + 0.65, 0, -1, [0.6, 0.95, 0.6], false);
      if (u === 2.5 || u === 7.5) s.item("computerScreen", u, v - 0.05, 0, -1, [0.55, 0.42, 0.18], false, 0.75);
    }
  }
  for (const u of [1.3, 2.6, 3.9]) s.item("bookcaseClosedDoors", u, D - WALL - 0.25, 0, -1, [1.1, 1.9, 0.45]);
  s.item("pottedPlant", 11.3, 11.2, 0, -1, [0.5, 1.1, 0.5], false);

  s.room("tu", "Tata Usaha", 12, 18, vIn, D - WALL);
  for (const u of [14, 16.5]) {
    s.item("desk", u, 5.6, 0, -1, [1.2, 0.75, 0.6]);
    s.item("chairDesk", u, 6.25, 0, -1, [0.6, 0.95, 0.6], false);
    s.item("computerScreen", u, 5.55, 0, -1, [0.55, 0.42, 0.18], false, 0.75);
  }
  for (const u of [13, 13.8]) s.item("sideTableDrawers", u, D - WALL - 0.3, 0, -1, [0.7, 1, 0.55]);
  s.spot("mcb", 17.3, vIn + 0.02, 0, 1, 1.4);
  s.item("speaker", 12.6, vIn + 0.15, 0, 1, [0.3, 0.45, 0.25], false, 2.6);

  s.room("kepsek", "Kepala Sekolah", 18, L, vIn, D - WALL);
  s.item("desk", 21, 7.5, 0, -1, [1.4, 0.75, 0.7]);
  s.item("chairDesk", 21, 8.2, 0, -1, [0.6, 1, 0.6], false);
  for (const u of [20.4, 21.6]) s.item("chair", u, 6.4, 0, 1, [0.45, 0.85, 0.45], false);
  s.item("bookcaseClosedDoors", 22.6, D - WALL - 0.25, 0, -1, [1.1, 1.9, 0.45]);
  s.item("pottedPlant", 23.3, 3.2, 0, 1, [0.5, 1.1, 0.5], false);

  s.spot("kentongan", 15, 1.1, 0, 1, 1.2);
}

function perpustakaan(plan: Plan, F: Frame, b: string, y00: number) {
  const { L, D } = F;
  const s = new Storey(plan, F, b, 0, y00, y00 + CEILING);
  s.room("perpustakaan", "Perpustakaan", 0, L, 0, D);
  s.wall("u", 0, L, 0, WALL, [win(3, 1.5), door(7.5, 1.6), win(12, 1.5)], s.y1, [7.5, 6]);
  s.wall("u", 0, L, D - WALL, D, [win(2.5), win(6), win(9), win(12.5)]);
  s.wall("v", WALL, D - WALL, 0, WALL, [win(4), win(8), win(12), win(16)]);
  s.wall("v", WALL, D - WALL, L - WALL, L, [win(4), win(8), win(12), win(16)]);
  for (const v of [10.5, 12.8, 15.1]) {
    for (const u of [2.6, 3.7, 4.8, 5.9, 9.1, 10.2, 11.3, 12.4]) {
      s.item("bookcaseOpen", u, v - 0.18, 0, -1, [1.05, 2, 0.35]);
      s.item("bookcaseOpen", u, v + 0.18, 0, 1, [1.05, 2, 0.35]);
    }
  }
  for (const [u, v] of [
    [3.5, 4],
    [11.5, 4],
    [3.5, 7],
    [11.5, 7],
  ]) {
    s.item("table", u, v, 0, 1, [1.8, 0.75, 0.9]);
    for (const du of [-0.5, 0.5]) {
      s.item("chair", u + du, v - 0.7, 0, 1, [0.42, 0.85, 0.42], false);
      s.item("chair", u + du, v + 0.7, 0, -1, [0.42, 0.85, 0.42], false);
    }
    s.item("books", u - 0.3, v, 0, 1, [0.3, 0.2, 0.2], false, 0.75);
  }
  s.item("desk", 12.4, 2.2, 0, -1, [1.4, 0.75, 0.6]);
  s.item("chairDesk", 12.4, 2.85, 0, -1, [0.6, 0.95, 0.6], false);
  s.item("computerScreen", 12.4, 2.15, 0, -1, [0.55, 0.42, 0.18], false, 0.75);
  for (const [u, v] of [
    [0.6, 0.6],
    [L - 0.6, 0.6],
  ]) s.item("pottedPlant", u, v, 0, 1, [0.5, 1.1, 0.5], false);
}

function kantin(plan: Plan, F: Frame, b: string, y00: number) {
  const { L, D } = F;
  const kitchen = 12;
  const s = new Storey(plan, F, b, 0, y00, y00 + 3.2);
  s.room("kantin", "Kantin", 0, L, 0, kitchen);
  for (const v of [0.15, 4, 8]) for (const u of [0.15, L / 2, L - 0.15]) if (v > 0.15 || u !== L / 2) s.box("column", u - 0.12, u + 0.12, v - 0.12, v + 0.12, y00, s.y1);
  s.room("dapur", "Dapur", 0, L, kitchen, D);
  s.wall("u", 0, L, kitchen, kitchen + WALL, [hatch(3.5, 4), door(7.4)], s.y1, [7.4, 15]);
  s.wall("u", 0, L, D - WALL, D, [win(4.5, 1.2)]);
  s.wall("v", kitchen, D - WALL, 0, WALL, [win(15, 1.2)]);
  s.wall("v", kitchen, D - WALL, L - WALL, L, [win(15, 1.2)]);
  for (const u of [2, 3, 4, 5]) s.item("kitchenBar", u, kitchen + 0.5, 0, -1, [1, 0.95, 0.6]);
  s.item("kitchenStove", 1.2, D - WALL - 0.32, 0, -1, [0.8, 0.9, 0.6]);
  for (const u of [2.05, 2.9]) s.item("kitchenCabinet", u, D - WALL - 0.32, 0, -1, [0.85, 0.9, 0.6]);
  s.item("kitchenSink", 3.8, D - WALL - 0.32, 0, -1, [0.9, 0.9, 0.6]);
  s.item("kitchenFridge", L - 0.6, D - WALL - 0.4, 0, -1, [0.8, 1.8, 0.7]);
  s.spot("gas", 0.55, D - 1.05, 0, -1, 0);
  for (const u of [2.3, 6.7]) {
    for (const v of [2.6, 6, 9.4]) {
      s.item("table", u, v, 0, 1, [0.9, 0.75, 2]);
      for (const du of [-0.8, 0.8]) s.item("bench", u + du, v, 0, 1, [0.4, 0.45, 1.9], false);
    }
  }
}

function musholla(plan: Plan, F: Frame, b: string, y00: number) {
  const { L, D } = F;
  const hall = 2;
  const s = new Storey(plan, F, b, 0, y00, y00 + CEILING);
  s.room("selasar", "Serambi", 0, L, 0, hall);
  s.room("musholla", "Musholla", 0, L, hall + WALL, D - WALL);
  for (const u of [0.15, 4, 8, L - 0.15]) s.box("column", u - 0.15, u + 0.15, 0, 0.3, y00, s.y1);
  s.wall("u", 0, L, hall, hall + WALL, [win(1.8, 1.2), door(4), door(8), win(10.2, 1.2)], s.y1, [6, 6]);
  s.wall("u", 0, L, D - WALL, D, [win(3), win(6), win(9)]);
  // West wall faces the qibla, so it carries the mihrab instead of a window in the middle.
  s.wall("v", hall, D - WALL, 0, WALL, [win(4, 1.2), win(10, 1.2)]);
  s.box("trim", WALL, WALL + 0.05, 6, 8, y00, y00 + 2.6, "#2c6e57");
  s.wall("v", hall, D - WALL, L - WALL, L, [win(4.5, 1.2), win(7.5, 1.2), win(10.5, 1.2)]);
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k < 7; k++) s.item("rugRectangle", 1.6 + row * 1.5, 3.2 + k * 1.15, -1, 0, [0.75, 0.02, 1.25], false);
  }
  s.item("bookcaseOpen", L - WALL - 0.2, 7, -1, 0, [1.4, 1.1, 0.35]);
  s.item("bench", 6, 0.9, 0, 1, [1.8, 0.45, 0.4], false);
}

function buildPlan(): Plan {
  const plan: Plan = { parts: [], rooms: [], doors: [], panes: [], items: [], seats: [], ramps: [], spots: [], base: {}, floorY: {}, footprint: {} };
  const rects = buildingRects();
  for (const [b, info] of Object.entries(BUILDINGS)) {
    const r = rects[b];
    const F = frame(b);
    const base = Math.min(tileElevation(r.x0, r.z0), tileElevation(r.x1, r.z1)) - 0.1;
    const y00 = base + PLINTH;
    const top = y00 + info.floors * STOREY;
    const fp = { x0: r.x0 * TILE, z0: r.z0 * TILE, x1: (r.x1 + 1) * TILE, z1: (r.z1 + 1) * TILE };
    plan.base[b] = base;
    plan.floorY[b] = y00;
    plan.footprint[b] = fp;
    const ground = new Storey(plan, F, b, 0, y00, y00);
    ground.box("floor", 0, F.L, 0, F.D, base, y00);
    if (info.kind === "kelas") kelas(plan, F, b, y00, base);
    else if (info.kind === "kantor") kantor(plan, F, b, y00);
    else if (info.kind === "perpustakaan") perpustakaan(plan, F, b, y00);
    else if (info.kind === "kantin") kantin(plan, F, b, y00);
    else musholla(plan, F, b, y00);
    const roof = new Storey(plan, F, b, info.floors, top, top);
    if (info.kind === "kantin") roof.box("roof", 0, F.L, 0, F.D, y00 + 3.2, y00 + 4.4);
    else {
      roof.box("floor", 0, F.L, 0, F.D, top - SLAB, top);
      roof.box("roof", -0.8, F.L + 0.8, -0.8, F.D + 0.8, top, top + (info.kind === "musholla" ? 0.4 : 2.2));
    }
  }
  return plan;
}

export const PLAN = buildPlan();

export const classrooms = () => PLAN.rooms.filter((r) => r.kind === "kelas");

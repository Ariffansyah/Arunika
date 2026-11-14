import { useSyncExternalStore } from "react";
import { BUILDINGS, SPAWN, TILE, idx, tileCenter, type Tile } from "@/lib/campus";
import { PLAN, classrooms, type Room } from "@/lib/floorplan";
import { buildingAt, cellCenter, flowField, groundY, routeFrom, routeLength, upperFloorAt } from "@/lib/nav";
import {
  NONE,
  campusRisks,
  grade,
  hazardTiles,
  inRunout,
  random,
  safeAssembly,
  scoreDrill,
  timeline,
  within,
  type DrillStats,
  type Scenario,
  type Site,
  type Structure,
  type Tracked,
} from "@/lib/sim";
import type { School } from "@/lib/supabase";

export type DrillResult = DrillStats & { score: number };
// What E (or the Aksi button) would do right now, shown next to the thing it acts on.
export type Prompt = { id: string; label: string; x: number; y: number; z: number };
// Metres, with height so the route can be drawn up and down stairs.
export type Route = [x: number, y: number, z: number][];

type State = {
  phase: "idle" | "running" | "done";
  scenario: Scenario;
  // Classroom the drill starts in.
  room: string;
  startAt: number;
  route: Route | null;
  showRoute: boolean;
  showRisk: boolean;
  result: DrillResult | null;
  chatOpen: boolean;
  view: "third" | "first";
  prompt: Prompt | null;
  closedDoors: string[];
  power: boolean;
  gas: boolean;
  mapOpen: boolean;
};

let state: State = {
  phase: "idle",
  scenario: { kind: "gempa", intensity: 6.5 },
  room: classrooms()[0].id,
  startAt: 0,
  route: null,
  showRoute: false,
  showRisk: false,
  result: null,
  chatOpen: false,
  view: "third",
  prompt: null,
  closedDoors: [],
  power: true,
  gas: true,
  mapOpen: false,
};

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getState = () => state;
export function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const useDrill = <T,>(select: (s: State) => T) =>
  useSyncExternalStore(subscribe, () => select(state), () => select(state));

// Per-frame values live outside React so 60 fps updates never re-render the HUD.
const [SPAWN_X, SPAWN_Z] = tileCenter(...SPAWN);
// layer 1 is the upper floor; y is the drawn height, eased toward the ground under the player.
export const player = {
  x: SPAWN_X,
  z: SPAWN_Z,
  layer: 0,
  y: groundY(SPAWN_X, SPAWN_Z, 0),
  heading: 0,
  crouch: false,
  moving: false,
  running: false,
  wading: false,
  seated: false,
  // Taking cover under this desk, as an index into PLAN.items.
  cover: -1,
};
export const input = { up: false, down: false, left: false, right: false, crouch: false, run: false };
// Set by the room connection; actions here use it to tell the other players.
export const net = { send: null as ((event: string, payload: Record<string, unknown>) => void) | null };
// yaw 0 puts the camera south of the player, looking north.
export const look = { yaw: 0, camPitch: 0.38, eyePitch: -0.05 };
export const remotes = new Map<string, { x: number; z: number; layer: number; crouch: boolean; at: number }>();
const blankTrack = (): Tracked => ({
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
  powerOff: false,
  alarm: false,
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

// Warning signs on the hill before a landslide, in the order they appear.
export const SIGNS = [
  { x: 88, z: 9, label: "Periksa retakan tanah" },
  { x: 92, z: 22, label: "Periksa pohon miring" },
  { x: 84, z: 16, label: "Periksa air keruh" },
];

export const run = {
  hazards: new Set<number>(),
  goals: [] as Tile[],
  walked: 0,
  hintUsed: false,
  optimalLen: 0,
  optimalRoute: null as Route | null,
  // Walking distance to safety from every spot on the campus, for hints and classmates.
  field: null as Float64Array | null,
  seed: 0,
  timeline: NONE,
  // Doorways buried by rubble: a damaged building loses an exit, so the class must use the other door.
  blocked: [] as string[],
  // In a flood the upper floor of Gedung Kelas A is a refuge (vertical evacuation).
  upstairs: false,
  // Windowless rooms in buildings strong enough to sit out a whirlwind.
  shelters: [] as Room[],
  arrived: false,
  // When each tall piece of furniture topples and each window breaks, by index into PLAN.items / PLAN.panes.
  falls: new Map<number, number>(),
  breaks: new Map<number, number>(),
  outsideS: 0,
  track: blankTrack(),
};

export const drillTime = () => {
  const s = getState();
  return s.phase === "idle" ? -Infinity : (Date.now() - s.startAt) / 1000;
};
export const shakingAt = (t: number) => within(run.timeline.shake, t);
export const aftershockAt = (t: number) => within(run.timeline.aftershock, t);

const TALL = PLAN.items.flatMap((it, i) => (it.size[1] >= 1.5 ? [i] : []));

// How far a tall piece of furniture has toppled, as an angle from upright.
export function fallTilt(i: number) {
  const at = run.falls.get(i);
  if (at === undefined || getState().phase === "idle") return 0;
  const p = Math.min(1, Math.max(0, (drillTime() - at) / 0.6));
  return (Math.PI / 2) * p * p;
}

const near = (x: number, z: number, floor: number, owner: string) =>
  owner === buildingAt(player.x, player.z) && floor === player.layer && Math.hypot(x - player.x, z - player.z) < 1.3;
const nearPane = () => PLAN.panes.some((p) => near(p.x, p.z, p.floor, p.b));
// Glass and tall furniture are what hurts people indoors in an earthquake.
const nearFalling = () => nearPane() || TALL.some((i) => near(PLAN.items[i].x, PLAN.items[i].z, PLAN.items[i].floor, PLAN.items[i].b));

export const inShelter = () =>
  run.shelters.some((r) => r.floor === player.layer && player.x >= r.x0 && player.x <= r.x1 && player.z >= r.z0 && player.z <= r.z1);

// Called every frame of a running drill with the distance just walked and the water depth at the player.
export function trackDrill(dt: number, t: number, moved: number, depth: number) {
  const tr = run.track;
  const inside = buildingAt(player.x, player.z) !== null;
  const covering = player.crouch || player.cover >= 0;
  if (shakingAt(t)) {
    tr.shakeS += dt;
    if (covering) tr.coverS += dt;
    if (player.cover >= 0) tr.deskS += dt;
    tr.shakeMoved += moved;
    if (nearFalling()) tr.nearFallS += dt;
  } else if (getState().scenario.kind === "gempa") {
    if (inside && player.running) tr.runIndoorS += dt;
    if (!inside) run.outsideS += dt;
    else if (run.outsideS > 3) tr.reentered = true;
    if (!inside && run.hazards.has(idx(Math.floor(player.x / TILE), Math.floor(player.z / TILE)))) tr.debrisS += dt;
    if (aftershockAt(t)) {
      tr.aftershockS += dt;
      if (covering) tr.aftershockCoverS += dt;
      if (inside) tr.aftershockIndoorS += dt;
    }
  }
  if (depth >= 0.5) tr.deepWaterS += dt;
  const tl = run.timeline;
  if (tl.wind) {
    if (t >= tl.wind[0] && !run.arrived) {
      run.arrived = true;
      tr.sheltered = inShelter();
    }
    if (within(tl.wind, t)) {
      const b = buildingAt(player.x, player.z);
      tr.windS += dt;
      if (covering) tr.windCoverS += dt;
      if (nearPane()) tr.windWindowS += dt;
      if (!b || BUILDINGS[b].kind === "kantin") tr.windExposedS += dt;
      if (tr.sheltered && !inShelter()) tr.leftShelter = true;
    }
  }
  if (tl.slide !== null) {
    const danger = player.layer === 0 && inRunout(player.x, player.z);
    // Looking at the first signs is fine; after the last one, every second on the slope counts.
    if (danger && t >= tl.signs[tl.signs.length - 1]) tr.slopeS += dt;
    if (danger && t >= tl.slide && t < tl.slide + 8) {
      tr.caught = true;
      finishDrill(false);
    }
  }
}

// Seats the classmates take in whichever classroom the drill starts in; players get the rest.
export const CLASSMATE_SEATS = [1, 2, 6, 9, 11, 14, 17, 20, 22, 25, 27, 30];
export const roomSeats = (room: string) => PLAN.seats.filter((s) => s.room === room);

export const resetInput = () => Object.keys(input).forEach((k) => (input[k as keyof typeof input] = false));

// The chat takes focus, so held movement keys are released first.
export function openChat() {
  if (getState().phase === "running") return;
  resetInput();
  setState({ chatOpen: true });
}

const DEFAULT_SITE: Site = { soil: "sedang", coast_km: 1, rain_30d_mm: 250 };
const DEFAULT_MAIN: Structure = { floors: 2, material: "beton_bertulang", built_year: 2000 };

export function schoolModel(school: School | null) {
  if (!school) return { main: DEFAULT_MAIN, site: DEFAULT_SITE };
  return {
    main: { floors: school.floors, material: school.material, built_year: school.built_year },
    site: { soil: school.soil, coast_km: school.coast_km, rain_30d_mm: school.rain_30d_mm },
  };
}

export function predict(s: Scenario, school: School | null, year?: number) {
  const { main, site } = schoolModel(school);
  const risks = campusRisks(main, site, s, year);
  const hazards = hazardTiles(s, risks);
  return { risks, hazards, goals: safeAssembly(s, hazards) };
}

export const GOAL_RADIUS = 4.5;

// The upper floor of Gedung Kelas A, not its stairs.
export const isUpstairs = (x: number, z: number, layer: number) => layer === 1 && upperFloorAt(x, z);

function safetyField(goals: Tile[], hazards: Set<number>, upstairs: boolean, blocked: string[], shelters: Room[]) {
  const centres = goals.map((g) => tileCenter(...g));
  const rubble = PLAN.doors.filter((d) => blocked.includes(d.id));
  return flowField(
    (layer, k) => {
      const [x, z] = cellCenter(k);
      return (
        (layer === 0 && centres.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < GOAL_RADIUS)) ||
        (upstairs && isUpstairs(x, z, layer)) ||
        shelters.some((r) => r.floor === layer && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)
      );
    },
    (layer, k) => {
      const [x, z] = cellCenter(k);
      return layer === 0 && hazards.has(idx(Math.floor(x / TILE), Math.floor(z / TILE)));
    },
    (layer, k) => {
      const [x, z] = cellCenter(k);
      return rubble.some((d) => d.floor === layer && Math.hypot(d.x - x, d.z - z) < 0.8);
    },
  );
}

// Doors of the drill's classroom: the walls of a room touch it within a wall's thickness.
const roomDoors = (room: string) => {
  const r = PLAN.rooms.find((q) => q.id === room)!;
  return PLAN.doors.filter((d) => d.b === r.b && d.floor === r.floor && d.x > r.x0 - 0.3 && d.x < r.x1 + 0.3 && d.z > r.z0 - 0.3 && d.z < r.z1 + 0.3);
};

export function startDrill(
  scenario: Scenario,
  school: School | null,
  delayMs = 1500,
  room = classrooms()[0].id,
  seed = Math.floor(Math.random() * 2 ** 31),
) {
  // A drill begins mid-lesson: everyone at a desk in the same classroom, never already somewhere safe.
  const free = roomSeats(room).filter((_, i) => !CLASSMATE_SEATS.includes(i));
  const seat = free[Math.floor(Math.random() * free.length)];
  const layer = PLAN.rooms.find((r) => r.id === room)!.floor;
  Object.assign(player, {
    x: seat.x,
    z: seat.z,
    layer,
    y: groundY(seat.x, seat.z, layer),
    heading: seat.ry,
    crouch: false,
    moving: false,
    running: false,
    wading: false,
    seated: true,
    cover: -1,
  });
  look.yaw = seat.ry + Math.PI;
  const { hazards, goals, risks } = predict(scenario, school);
  const rnd = random(seed);
  const plan = timeline(scenario, seed);
  const quake = scenario.kind === "gempa";
  const building = PLAN.rooms.find((r) => r.id === room)!.b;
  const exits = roomDoors(room);
  const blocked = quake && risks[building] >= 60 && exits.length > 1 ? [exits[Math.floor(rnd() * exits.length)].id] : [];
  const upstairs = scenario.kind === "banjir";
  // A weak building's shelter room is no shelter; if every building is weak, the best of them still beats outdoors.
  const strong = PLAN.rooms.filter((r) => r.shelter && risks[r.b] < 40);
  const shelters = scenario.kind !== "angin" ? [] : strong.length ? strong : PLAN.rooms.filter((r) => r.shelter);
  const field = safetyField(goals, hazards, upstairs, blocked, shelters);
  const route = routeFrom(field, player.x, player.z, layer);
  const falls = new Map<number, number>();
  const breaks = new Map<number, number>();
  if (quake && plan.shake) {
    const end = plan.shake[1];
    if (scenario.intensity >= 6.5) for (const i of TALL) if (rnd() < 0.6) falls.set(i, end * (0.25 + 0.5 * rnd()));
    if (scenario.intensity >= 6) PLAN.panes.forEach((_, i) => rnd() < 0.5 && breaks.set(i, end * (0.15 + 0.6 * rnd())));
  }
  Object.assign(run, {
    hazards,
    goals,
    walked: 0,
    hintUsed: false,
    optimalLen: routeLength(route),
    optimalRoute: route,
    field,
    seed,
    timeline: plan,
    blocked,
    upstairs,
    shelters,
    arrived: false,
    falls,
    breaks,
    outsideS: 0,
    track: blankTrack(),
  });
  setState({
    phase: "running",
    scenario,
    room,
    startAt: Date.now() + delayMs,
    route,
    showRoute: false,
    result: null,
    chatOpen: false,
    mapOpen: false,
    closedDoors: [],
    power: true,
    gas: true,
  });
}

export function showHint() {
  if (!run.field) return;
  run.hintUsed = true;
  setState({ route: routeFrom(run.field, player.x, player.z, player.layer), showRoute: true });
}

export function finishDrill(reached: boolean) {
  const s = getState();
  if (s.phase !== "running") return;
  const tracked = { ...run.track, reached, powerOff: !s.power };
  const stats: DrillStats = {
    scenario: s.scenario,
    reached,
    timeS: Math.max(0, (Date.now() - s.startAt) / 1000),
    walked: run.walked,
    optimalLen: run.optimalLen,
    leadS: run.timeline.shake?.[1] ?? run.timeline.wind?.[1] ?? 0,
    hintUsed: run.hintUsed,
    checks: grade(s.scenario.kind, tracked),
  };
  // The results show the optimal route from the start, not whatever hint was last drawn.
  setState({ phase: "done", route: run.optimalRoute, showRoute: true, result: { ...stats, score: scoreDrill(stats) } });
}

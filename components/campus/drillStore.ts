import { useSyncExternalStore } from "react";
import { SPAWN, TILE, idx, tileCenter, type Tile } from "@/lib/campus";
import { PLAN, classrooms } from "@/lib/floorplan";
import { cellCenter, flowField, groundY, routeFrom, routeLength } from "@/lib/nav";
import {
  campusRisks,
  hazardTiles,
  safeAssembly,
  scoreDrill,
  type DrillStats,
  type Scenario,
  type Site,
  type Structure,
} from "@/lib/sim";
import type { School } from "@/lib/supabase";

export type DrillResult = DrillStats & { score: number };
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
  nearWarden: boolean;
  chatOpen: boolean;
  view: "third" | "first";
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
  nearWarden: false,
  chatOpen: false,
  view: "third",
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
};
export const input = { up: false, down: false, left: false, right: false, crouch: false, run: false };
// yaw 0 puts the camera south of the player, looking north.
export const look = { yaw: 0, camPitch: 0.38, eyePitch: -0.05 };
export const remotes = new Map<string, { x: number; z: number; layer: number; crouch: boolean; at: number }>();
export const run = {
  hazards: new Set<number>(),
  goals: [] as Tile[],
  walked: 0,
  hazardS: 0,
  coverS: 0,
  hintUsed: false,
  optimalLen: 0,
  optimalRoute: null as Route | null,
  // Walking distance to safety from every spot on the campus, for hints and classmates.
  field: null as Float64Array | null,
};

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

function safetyField(goals: Tile[], hazards: Set<number>) {
  const centres = goals.map((g) => tileCenter(...g));
  return flowField(
    (layer, k) => {
      const [x, z] = cellCenter(k);
      return layer === 0 && centres.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < GOAL_RADIUS);
    },
    (layer, k) => {
      const [x, z] = cellCenter(k);
      return layer === 0 && hazards.has(idx(Math.floor(x / TILE), Math.floor(z / TILE)));
    },
  );
}

export function startDrill(scenario: Scenario, school: School | null, delayMs = 1500, room = classrooms()[0].id) {
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
  });
  look.yaw = seat.ry + Math.PI;
  const { hazards, goals } = predict(scenario, school);
  const field = safetyField(goals, hazards);
  const route = routeFrom(field, player.x, player.z, layer);
  Object.assign(run, {
    hazards,
    goals,
    walked: 0,
    hazardS: 0,
    coverS: 0,
    hintUsed: false,
    optimalLen: routeLength(route),
    optimalRoute: route,
    field,
  });
  setState({ phase: "running", scenario, room, startAt: Date.now() + delayMs, route, showRoute: false, result: null, chatOpen: false });
}

export function showHint() {
  if (!run.field) return;
  run.hintUsed = true;
  setState({ route: routeFrom(run.field, player.x, player.z, player.layer), showRoute: true });
}

export function finishDrill(reached: boolean) {
  const s = getState();
  if (s.phase !== "running") return;
  const stats: DrillStats = {
    scenario: s.scenario,
    reached,
    timeS: Math.max(0, (Date.now() - s.startAt) / 1000),
    walked: run.walked,
    optimalLen: run.optimalLen,
    hazardS: run.hazardS,
    coverS: run.coverS,
    hintUsed: run.hintUsed,
  };
  // The results show the optimal route from the start, not whatever hint was last drawn.
  setState({ phase: "done", route: run.optimalRoute, showRoute: true, result: { ...stats, score: scoreDrill(stats) } });
}

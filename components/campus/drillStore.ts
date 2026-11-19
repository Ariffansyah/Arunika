import { useSyncExternalStore } from "react";
import { BUILDINGS, MAP, SPAWN, TILE, buildingRects, findTiles, idx, tileAt, tileCenter, type Tile } from "@/lib/campus";
import { PLAN, classrooms, type Room } from "@/lib/floorplan";
import { N, buildingAt, cellCenter, flowField, groundY, routeFrom, routeLength, upperFloorAt } from "@/lib/nav";
import {
  NONE,
  SLIDE_S,
  campusRisks,
  blankTracked,
  grade,
  hazardTiles,
  inLane,
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
} from "@/lib/sim";
import { fallenBox, outdoors, situation, type Situation } from "@/lib/situation";
import type { School } from "@/lib/supabase";
import type { Anim } from "@/components/Character";

// The trail and the best route are in plan units (tiles), ready to draw on the campus plan.
// `caught` is a drill cut short by the disaster itself: buried by the slide or under a building that fell.
export type DrillResult = DrillStats & { score: number; guided: boolean; caught: boolean; trail: [number, number][]; route: [number, number][] };
// What E (or the Aksi button) would do right now, named on the HUD and marked over the thing it acts on.
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
  // Where a jump is possible right now (Space), shown over the obstacle.
  vaultAt: { x: number; y: number; z: number } | null;
  closedDoors: string[];
  power: boolean;
  mapOpen: boolean;
  // A practice run: the route is shown, there is no time limit, and nothing is scored or shared.
  guided: boolean;
  // How many classmates walk the campus; each player's own choice, not shared with the room.
  npc: number;
  // Graphics tier, and whether it was picked for this device rather than by the player.
  quality: Quality;
  qualityAuto: boolean;
  // Share of the scene's model files downloaded so far, for the loading screen.
  loaded: number;
};

export type Quality = "ringan" | "seimbang" | "tinggi";
export const QUALITIES: Quality[] = ["ringan", "seimbang", "tinggi"];
// Pixel ratio is the biggest lever on phones with 3x screens; then the shadow pass, which draws every caster
// a second time; then the hundreds of grass tufts and trees past the fence.
export const TIER: Record<
  Quality,
  { dpr: [number, number]; shadows: boolean; shadowSize: number; furnitureShadows: boolean; npcShadows: boolean; trees: number; grass: boolean; far: number }
> = {
  ringan: { dpr: [1, 1], shadows: false, shadowSize: 0, furnitureShadows: false, npcShadows: false, trees: 0.25, grass: false, far: 650 },
  seimbang: { dpr: [1, 1.5], shadows: true, shadowSize: 1024, furnitureShadows: false, npcShadows: false, trees: 0.55, grass: true, far: 1000 },
  tinggi: { dpr: [1, 2], shadows: true, shadowSize: 2048, furnitureShadows: true, npcShadows: true, trees: 1, grass: true, far: 1500 },
};

// A first guess from what the browser says about the device; the frame-rate monitor lowers it if it was too hopeful.
export function detectQuality(): Quality {
  if (typeof navigator === "undefined") return "seimbang";
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  if (memory <= 4 || cores <= 4) return "ringan";
  if (touch || memory <= 6 || cores < 8) return "seimbang";
  return "tinggi";
}

const saved = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const savedQuality = saved("arunika:grafis") as Quality | null;
const quality = savedQuality && QUALITIES.includes(savedQuality) ? savedQuality : detectQuality();

export const NPC_COUNTS = [0, 4, 12];
const savedNpc = () => {
  const v = saved("arunika:npc");
  return v !== null && NPC_COUNTS.includes(Number(v)) ? Number(v) : quality === "ringan" ? 4 : 12;
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
  vaultAt: null,
  closedDoors: [],
  power: true,
  mapOpen: false,
  guided: false,
  npc: savedNpc(),
  quality,
  qualityAuto: !savedQuality,
  loaded: 0,
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

export function setNpc(n: number) {
  setState({ npc: n });
  try {
    localStorage.setItem("arunika:npc", String(n));
  } catch {
    // Private windows can refuse storage; the choice still holds for this visit.
  }
}

// `null` goes back to the device's own tier.
export function setQuality(q: Quality | null) {
  setState({ quality: q ?? detectQuality(), qualityAuto: q === null });
  try {
    if (q) localStorage.setItem("arunika:grafis", q);
    else localStorage.removeItem("arunika:grafis");
  } catch {
    // Private windows can refuse storage; the choice still holds for this visit.
  }
}

// The frame-rate monitor steps an automatic tier down; a tier the player chose is left alone. Turning shadows off
// recompiles every material and stalls the screen, so mid-drill that step waits until the drill is over.
export function lowerQuality() {
  const i = QUALITIES.indexOf(state.quality);
  if (!state.qualityAuto || i <= 0) return;
  if (state.phase === "running" && TIER[QUALITIES[i - 1]].shadows !== TIER[state.quality].shadows) {
    const after = subscribe(() => {
      if (state.phase === "running") return;
      after();
      lowerQuality();
    });
    return;
  }
  setState({ quality: QUALITIES[i - 1] });
}

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
  // What the body is doing, for the clip and for the other players.
  anim: "idle" as Anim,
};
// `jump` is a press, cleared once read; the others are held. `mx` and `my` are the touch stick, -1 to 1 right and forward.
export const input = { up: false, down: false, left: false, right: false, crouch: false, run: false, jump: false, mx: 0, my: 0 };
export type Held = "up" | "down" | "left" | "right" | "crouch" | "run";
const REST = { ...input };
// Set by the room connection; actions here use it to tell the other players.
export const net = { send: null as ((event: string, payload: Record<string, unknown>) => void) | null };
// yaw 0 puts the camera south of the player, looking north. cine is how far the camera is into its aerial shot, 0 to 1.
export const look = { yaw: 0, camPitch: 0.38, eyePitch: -0.05, cine: 1 };
// Set by the chat while an answer streams in or is read aloud, so the warden's mouth moves only then.
export const warden = { talking: false };
export const remotes = new Map<string, { x: number; z: number; layer: number; anim: Anim; at: number }>();

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
  track: blankTracked(),
  // Which of the map's slide lanes gives way in a landslide drill.
  lane: 0,
  situation: null as Situation | null,
  // Where each classmate starts, as x, z, facing and floor.
  mates: [] as [number, number, number, number][],
  // Each classmate's own field, out by the door nearest their seat; empty when the drill starts outside a room.
  mateFields: [] as Float64Array[],
  // Doors jammed shut for the whole drill, and the assembly point a fallen pole made unsafe.
  locked: [] as string[],
  closedGoal: null as Tile | null,
  // Where the player went, every half second, to compare with the best route afterwards.
  trail: [] as [number, number][],
  trailAt: 0,
  // Buildings that come down in this drill: when, and the way a slide pushes the wreck (null falls in place).
  collapses: new Map<string, { at: number; push: [number, number] | null }>(),
};

// Whether the building has come down by now, for drawing and for walking.
export const collapsed = (b: string) => {
  const c = run.collapses.get(b);
  return !!c && getState().phase !== "idle" && drillTime() >= c.at;
};

// When the tree in the situation comes down: late in the shaking, or as the whirlwind leaves.
export const fallenAt = () => {
  const f = run.situation?.fallen;
  if (!f) return Infinity;
  return f.at === "shake" ? (run.timeline.shake?.[1] ?? 0) * 0.6 : (run.timeline.wind?.[1] ?? Infinity);
};

const SIGN_LABELS = ["Kenali retakan tanah", "Kenali pohon miring", "Kenali air keruh"];
// Warning signs on the slope before a landslide, in the order they appear.
export const landslideSigns = () => (MAP.runouts[run.lane]?.signs ?? []).map(([x, z], i) => ({ x, z, label: SIGN_LABELS[i] }));

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
// Outdoors it is walls, trees and poles that come down: within 3 m of a building or a tree.
const nearStructure = () => {
  const [tx, tz] = [Math.floor(player.x / TILE), Math.floor(player.z / TILE)];
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const c = tileAt(tx + dx, tz + dz);
      if (!"T123456".includes(c)) continue;
      const [cx, cz] = [Math.min(Math.max(player.x, (tx + dx) * TILE), (tx + dx + 1) * TILE), Math.min(Math.max(player.z, (tz + dz) * TILE), (tz + dz + 1) * TILE)];
      if (Math.hypot(cx - player.x, cz - player.z) < (c === "T" ? 4.5 : 3)) return true;
    }
  }
  return false;
};

export const inShelter = () =>
  run.shelters.some((r) => r.floor === player.layer && player.x >= r.x0 && player.x <= r.x1 && player.z >= r.z0 && player.z <= r.z1);

const POWER_CUT_S = 20;

// Called every frame of a running drill with the distance just walked and the water depth at the player.
export function trackDrill(dt: number, t: number, moved: number, depth: number) {
  const tr = run.track;
  if (t >= run.trailAt) {
    run.trail.push([player.x, player.z]);
    run.trailAt = t + 0.5;
  }
  const inside = buildingAt(player.x, player.z) !== null;
  // Ducking counts as cover only when still; walking ducked is just walking.
  const covering = (player.crouch && !player.moving) || player.cover >= 0;
  if (shakingAt(t)) {
    tr.shakeS += dt;
    if (covering) tr.coverS += dt;
    // Full marks for cover: under a desk indoors, or ducked in the open clear of anything that can fall.
    if (player.cover >= 0 || (!inside && covering && !nearStructure())) tr.deskS += dt;
    tr.shakeMoved += moved;
    if (inside ? nearFalling() : nearStructure()) tr.nearFallS += dt;
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
  if (tr.leftAt < 0 && run.walked > 5) tr.leftAt = t;
  if (depth >= 0.1 && player.running) tr.runWaterS += dt;
  if (depth >= 0.5) tr.deepWaterS += dt;
  // In a flood the school's staff cut the mains at the panel once water is in the yard; the lamps go dark.
  if (getState().scenario.kind === "banjir" && t >= POWER_CUT_S && getState().power) setState({ power: false });
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
    const lane = MAP.runouts[run.lane];
    if (lane && player.layer === 0 && inLane(lane, player.x, player.z) && t >= tl.slide && t < tl.slide + 8) {
      tr.caught = true;
      finishDrill(false);
    }
  }
  const b = buildingAt(player.x, player.z);
  const fall = b ? run.collapses.get(b) : undefined;
  if (fall && t >= fall.at && t < fall.at + 1) {
    tr.caught = true;
    finishDrill(false);
  }
}

// Seats the classmates take in whichever classroom the drill starts in; players get the rest.
export const CLASSMATE_SEATS = [1, 2, 6, 9, 11, 14, 17, 20, 22, 25, 27, 30];
export const roomSeats = (room: string) => PLAN.seats.filter((s) => s.room === room);

export const resetInput = () => Object.assign(input, REST);

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

const TREES = findTiles("T").map((t) => tileCenter(...t));
const footprintGap = (f: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number) =>
  Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1));

// What makes a stretch of the campus dangerous to walk in this drill, as extra cost per metre on each nav cell,
// so the route, the hint and the classmates take the safest way and not merely the shortest.
// Quake: every minute indoors, then the strip under a building's walls and roof edge, worst under weak buildings,
// and under trees. Flood: deeper water costs more, and knee-deep is avoided almost at any price.
// Landslide: the slide's path. Whirlwind: trees, the open air, and the canteen's light roof.
function dangerMap(s: Scenario, hazards: Set<number>, risks: Record<string, number>) {
  const out = new Float32Array(2 * N);
  const weight = (b: string) => (risks[b] >= 60 ? 1 : risks[b] >= 30 ? 0.6 : 0.3);
  const near = (x: number, z: number, r: number) => TREES.reduce((m, [tx, tz]) => Math.max(m, 1 - Math.hypot(tx - x, tz - z) / r), 0);
  for (let node = 0; node < 2 * N; node++) {
    const layer = node >= N ? 1 : 0;
    const [x, z] = cellCenter(node % N);
    const inside = buildingAt(x, z);
    const tile = hazards.has(idx(Math.floor(x / TILE), Math.floor(z / TILE)));
    let d = 0;
    if (s.kind === "gempa") {
      if (inside) d = 2 + 2 * weight(inside);
      else {
        for (const [b, f] of Object.entries(PLAN.footprint)) d = Math.max(d, 6 * weight(b) * Math.max(0, 1 - footprintGap(f, x, z) / 6));
        d = Math.max(d, 2 * near(x, z, 3));
      }
    } else if (s.kind === "banjir") {
      const depth = s.intensity - groundY(x, z, layer);
      d = depth <= 0 ? 0 : depth < 0.3 ? 1 : depth < 0.5 ? 3 : 12;
    } else if (s.kind === "longsor") d = tile ? 12 : 0;
    else d = (tile ? 4 : 0) + (inside ? (BUILDINGS[inside].kind === "kantin" ? 3 : 0) : 1 + 2 * near(x, z, 4));
    out[node] = d;
  }
  return out;
}

function safetyField(goals: Tile[], danger: Float32Array, upstairs: boolean, blocked: string[], shelters: Room[], trunk: ReturnType<typeof fallenBox> | null) {
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
    (layer, k) => danger[layer * N + k],
    (layer, k) => {
      const [x, z] = cellCenter(k);
      const underTrunk = !!trunk && layer === 0 && x > trunk.x0 - 0.3 && x < trunk.x1 + 0.3 && z > trunk.z0 - 0.3 && z < trunk.z1 + 0.3;
      return underTrunk || rubble.some((d) => d.floor === layer && Math.hypot(d.x - x, d.z - z) < 0.8);
    },
  );
}

// Doors of the drill's classroom: the walls of a room touch it within a wall's thickness.
const roomDoors = (room: string) => {
  const r = PLAN.rooms.find((q) => q.id === room)!;
  return PLAN.doors.filter((d) => d.b === r.b && d.floor === r.floor && d.x > r.x0 - 0.3 && d.x < r.x1 + 0.3 && d.z > r.z0 - 0.3 && d.z < r.z1 + 0.3);
};

export function startDrill(scenario: Scenario, school: School | null, delayMs = 1500, seed = Math.floor(Math.random() * 2 ** 31), guided = false) {
  const sit = situation(scenario, seed);
  const rnd = random(seed);
  const room = sit.room?.id ?? "";
  const layer = sit.room?.floor ?? 0;
  // A drill begins mid-activity: at a desk in class, or standing about elsewhere; never already somewhere safe.
  const seats = sit.place === "kelas" ? roomSeats(room) : [];
  const mates: [number, number, number, number][] = seats.length
    ? CLASSMATE_SEATS.map((i) => [seats[i].x, seats[i].z, seats[i].ry, layer])
    : sit.spots.slice(0, CLASSMATE_SEATS.length).map(([x, z, ry]) => [x, z, ry, layer]);
  const free = seats.length ? seats.filter((_, i) => !CLASSMATE_SEATS.includes(i)).map((s) => [s.x, s.z, s.ry] as const) : sit.spots.slice(CLASSMATE_SEATS.length);
  const [px, pz, ry] = free[Math.floor(Math.random() * free.length)] ?? sit.spots[0];
  Object.assign(player, {
    x: px,
    z: pz,
    layer,
    y: groundY(px, pz, layer),
    heading: ry,
    crouch: false,
    moving: false,
    running: false,
    wading: false,
    seated: seats.length > 0,
    cover: -1,
  });
  Object.assign(look, { yaw: ry + Math.PI, eyePitch: -0.05 });
  const { hazards, goals: safe, risks } = predict(scenario, school);
  // A fallen power pole closes one assembly point, as long as another one stays open.
  const closedGoal = sit.closedGoal && safe.length > 1 && safe.some(([x, z]) => x === sit.closedGoal![0] && z === sit.closedGoal![1]) ? sit.closedGoal : null;
  const goals = closedGoal ? safe.filter(([x, z]) => x !== closedGoal[0] || z !== closedGoal[1]) : safe;
  const plan = { ...timeline(scenario, seed), ...(guided ? { limit: Infinity } : {}) };
  const quake = scenario.kind === "gempa";
  const exits = room ? roomDoors(room) : [];
  // Rubble can bury a doorway of any building; a weak one always loses one.
  const blocked = quake && sit.room && exits.length > 1 && (risks[sit.room.b] >= 60 || rnd() < 0.45) ? [exits[Math.floor(rnd() * exits.length)].id] : [];
  const upstairs = scenario.kind === "banjir";
  // A weak building's shelter room is no shelter; if every building is weak, the best of them still beats outdoors.
  const strong = PLAN.rooms.filter((r) => r.shelter && risks[r.b] < 40);
  const pool = scenario.kind !== "angin" ? [] : strong.length ? strong : PLAN.rooms.filter((r) => r.shelter);
  // A jammed door takes one shelter out of use, unless it is the only one.
  const lockedRoom = sit.lockedRoom && pool.length > 1 && pool.some((r) => r.id === sit.lockedRoom) ? sit.lockedRoom : null;
  const shelters = pool.filter((r) => r.id !== lockedRoom);
  const locked = lockedRoom ? roomDoors(lockedRoom).map((d) => d.id) : [];
  const danger = dangerMap(scenario, hazards, risks);
  const trunk = sit.fallen ? fallenBox(sit.fallen) : null;
  const field = safetyField(goals, danger, upstairs, blocked, shelters, trunk);
  // A class leaves by the door nearest each seat, as drills assign them, unless rubble has shut it.
  const doors = exits.filter((d) => !blocked.includes(d.id));
  const doorFields = doors.length > 1 ? doors.map((d) => safetyField(goals, danger, upstairs, [...blocked, ...doors.filter((o) => o !== d).map((o) => o.id)], shelters, trunk)) : [];
  const mateFields = doorFields.length
    ? mates.map(([x, z]) => doorFields[doors.reduce((best, d, i) => (Math.hypot(d.x - x, d.z - z) < Math.hypot(doors[best].x - x, doors[best].z - z) ? i : best), 0)])
    : [];
  const route = routeFrom(field, player.x, player.z, layer);
  const falls = new Map<number, number>();
  const breaks = new Map<number, number>();
  if (quake && plan.shake) {
    const end = plan.shake[1];
    if (scenario.intensity >= 6.5) for (const i of TALL) if (rnd() < 0.6) falls.set(i, end * (0.25 + 0.5 * rnd()));
    if (scenario.intensity >= 6) PLAN.panes.forEach((_, i) => rnd() < 0.5 && breaks.set(i, end * (0.15 + 0.6 * rnd())));
  }
  const collapses = new Map<string, { at: number; push: [number, number] | null }>();
  // The weakest blocks come down with the aftershock, but never within half a minute of the main shaking:
  // time enough to walk out, so staying inside is what gets anyone caught.
  if (quake && plan.shake && plan.aftershock) {
    for (const [b, r] of Object.entries(risks)) if (r >= 70) collapses.set(b, { at: Math.max(plan.aftershock[0] + 1 + rnd(), plan.shake[1] + 30), push: null });
  }
  // A slide flattens whatever stands where its earth comes to rest (the strip drawn in the scene, which stops a
  // little past the lane's end), each building as the front reaches it.
  const lane = MAP.runouts[sit.lane];
  if (scenario.kind === "longsor" && lane && plan.slide !== null) {
    const len = Math.hypot(lane.bx - lane.ax, lane.bz - lane.az);
    const dir: [number, number] = [(lane.bx - lane.ax) / len, (lane.bz - lane.az) / len];
    for (const [b, r] of Object.entries(buildingRects())) {
      const hit: number[] = [];
      for (let z = r.z0; z <= r.z1; z++) {
        for (let x = r.x0; x <= r.x1; x++) {
          const [cx, cz] = tileCenter(x, z);
          const along = ((cx - lane.ax) * dir[0] + (cz - lane.az) * dir[1]) / len;
          const across = Math.abs((cx - lane.ax) * -dir[1] + (cz - lane.az) * dir[0]) / lane.r;
          if (along >= 0 && along <= 1.08 && across < 1) hit.push(along);
        }
      }
      if (hit.length >= 0.25 * (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1)) collapses.set(b, { at: plan.slide + (SLIDE_S * Math.max(0, Math.min(...hit))) / 1.15, push: dir });
    }
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
    track: blankTracked(),
    lane: sit.lane,
    situation: sit,
    mates,
    mateFields,
    locked,
    closedGoal,
    trail: [],
    trailAt: 0,
    collapses,
  });
  setState({
    phase: "running",
    scenario,
    room,
    startAt: Date.now() + delayMs,
    route,
    showRoute: guided,
    result: null,
    chatOpen: false,
    mapOpen: false,
    closedDoors: locked,
    power: true,
    guided,
  });
}

export function showHint() {
  if (!run.field) return;
  run.hintUsed = !getState().guided;
  setState({ route: routeFrom(run.field, player.x, player.z, player.layer), showRoute: true });
}

// The checklist as it stands mid-drill, for the guided practice.
export const liveChecks = () => {
  const s = getState();
  return grade(s.scenario.kind, run.track, !!run.situation && outdoors(run.situation));
};

export function finishDrill(reached: boolean) {
  const s = getState();
  if (s.phase !== "running") return;
  const tracked = { ...run.track, reached };
  const stats: DrillStats = {
    scenario: s.scenario,
    reached,
    timeS: Math.max(0, (Date.now() - s.startAt) / 1000),
    walked: run.walked,
    optimalLen: run.optimalLen,
    leadS: run.timeline.shake?.[1] ?? run.timeline.wind?.[1] ?? 0,
    hintUsed: run.hintUsed,
    checks: grade(s.scenario.kind, tracked, !!run.situation && outdoors(run.situation)),
  };
  // The results show the optimal route from the start, not whatever hint was last drawn.
  const result = {
    ...stats,
    score: scoreDrill(stats),
    guided: s.guided,
    caught: run.track.caught,
    trail: [...run.trail, [player.x, player.z]].map(([x, z]) => [x / TILE, z / TILE] as [number, number]),
    route: (run.optimalRoute ?? []).map(([x, , z]) => [x / TILE, z / TILE] as [number, number]),
  };
  setState({ phase: "done", route: run.optimalRoute, showRoute: true, result });
}

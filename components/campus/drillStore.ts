import { useSyncExternalStore } from "react";
import { GRID, SPAWN, type Tile } from "@/lib/campus";
import {
  bestRoute,
  campusRisks,
  hazardTiles,
  pathLength,
  safeAssembly,
  scoreDrill,
  type DrillStats,
  type Scenario,
  type Site,
  type Structure,
} from "@/lib/sim";
import type { School } from "@/lib/supabase";

export type DrillResult = DrillStats & { score: number };

type State = {
  phase: "idle" | "running" | "done";
  scenario: Scenario;
  startAt: number;
  route: Tile[] | null;
  showRoute: boolean;
  showRisk: boolean;
  result: DrillResult | null;
  nearWarden: boolean;
  chatOpen: boolean;
};

let state: State = {
  phase: "idle",
  scenario: { kind: "gempa", intensity: 6.5 },
  startAt: 0,
  route: null,
  showRoute: false,
  showRisk: false,
  result: null,
  nearWarden: false,
  chatOpen: false,
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
export const player = { x: SPAWN[0] + 0.5, z: SPAWN[1] + 0.5, heading: 0, crouch: false };
export const input = { up: false, down: false, left: false, right: false, crouch: false };
export const remotes = new Map<string, { x: number; z: number; crouch: boolean; at: number }>();
export const run = { hazards: new Set<number>(), goals: [] as Tile[], walked: 0, hazardS: 0, coverS: 0, hintUsed: false, optimalLen: 0 };

const DEFAULT_SITE: Site = { soil: "sedang", coast_km: 1, rain_30d_mm: 250 };
const DEFAULT_MAIN: Structure = { floors: 2, material: "beton_bertulang", built_year: 2000 };

export function schoolModel(school: School | null) {
  if (!school) return { main: DEFAULT_MAIN, site: DEFAULT_SITE };
  return {
    main: { floors: school.floors, material: school.material, built_year: school.built_year },
    site: { soil: school.soil, coast_km: school.coast_km, rain_30d_mm: school.rain_30d_mm },
  };
}

/** AI prediction for a scenario: per-building risk, hazard tiles at full intensity, safe assembly points. */
export function predict(s: Scenario, school: School | null) {
  const { main, site } = schoolModel(school);
  const risks = campusRisks(main, site, s);
  const hazards = hazardTiles(s, risks);
  return { risks, hazards, goals: safeAssembly(s, hazards) };
}

export const playerTile = (): Tile => [Math.floor(player.x), Math.floor(player.z)];

export function startDrill(scenario: Scenario, school: School | null, delayMs = 1500) {
  const { hazards, goals } = predict(scenario, school);
  const route = bestRoute(GRID, playerTile(), goals, hazards);
  Object.assign(run, { hazards, goals, walked: 0, hazardS: 0, coverS: 0, hintUsed: false, optimalLen: route ? pathLength(route) : 0 });
  setState({ phase: "running", scenario, startAt: Date.now() + delayMs, route, showRoute: false, result: null, chatOpen: false });
}

export function showHint() {
  const route = bestRoute(GRID, playerTile(), run.goals, run.hazards);
  run.hintUsed = true;
  setState({ route, showRoute: true });
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
  setState({ phase: "done", showRoute: true, result: { ...stats, score: scoreDrill(stats) } });
}

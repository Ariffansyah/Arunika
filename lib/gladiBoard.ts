import { ASSEMBLY, BUILDINGS, GRID, MAP, TILE, idx, tileAt, type Tile } from "./campus.ts";
import type { Board, Hazard, Move } from "./gladi.ts";
import { bestRoute, entranceTile, pathLength } from "./sim.ts";

// The browser half of the map steps: the campus engine's prediction turned into board facts, the places a
// building's occupants can be sent, and the routes the pathfinder walks to them. No AI is involved here.

export type Prediction = { risks: Record<string, number>; hazards: Set<number>; goals: Tile[] };
export type Target = { id: string; tile: Tile; building: boolean };

export const riskTone = (r: number) => (r >= 60 ? "#ff6b6b" : r >= 30 ? "#f0b429" : "#34c47c");

// Assembly points, plus sturdy upper floors in a flood and other buildings to shelter in during a whirlwind,
// which has no safe open-air point.
export function targets(hazard: Hazard, from: string): Target[] {
  const points = hazard === "angin" ? [] : ASSEMBLY.map((t) => ({ id: tileAt(...t), tile: t, building: false }));
  const buildings = Object.keys(BUILDINGS)
    .filter((id) => id !== from && (hazard === "angin" || (hazard === "banjir" && BUILDINGS[id].floors >= 2)))
    .map((id) => ({ id, tile: entranceTile(id), building: true }));
  return [...points, ...buildings];
}

export function boardOf(hazard: Hazard, intensity: number, p: Prediction): Board {
  const risks = Object.fromEntries(Object.entries(p.risks).map(([id, r]) => [id, Math.round(r)]));
  const safe = [
    ...p.goals.map(([x, z]) => tileAt(x, z)),
    ...Object.keys(BUILDINGS).filter((id) =>
      // An upper floor stays above the water even when the ground floor is damaged.
      hazard === "angin" ? risks[id] < 30 : hazard === "banjir" && BUILDINGS[id].floors >= 2,
    ),
  ];
  return { peta: MAP.id, intensity, risks, safe };
}

export function walk(from: string, to: Tile, hazards: Set<number>) {
  const start = entranceTile(from);
  const route = bestRoute(GRID, start, [to], hazards);
  // The yard right outside a damaged building is always in its rubble zone; only what the route walks into later counts.
  const crossed = route?.filter(([x, z]) => Math.max(Math.abs(x - start[0]), Math.abs(z - start[1])) > 2 && hazards.has(idx(x, z))).length ?? 0;
  return { route, crossed, meters: route ? Math.round(pathLength(route) * TILE) : 0 };
}

// The move to send to the server: the pick's route, and the safe target the pathfinder would have chosen.
export function routeMove(hazard: Hazard, board: Board, p: Prediction, from: string, target: Target) {
  const options = targets(hazard, from)
    .filter((t) => board.safe.includes(t.id))
    .map((t) => ({ t, ...walk(from, t.tile, p.hazards) }))
    .filter((o) => o.route)
    .sort((a, b) => a.crossed - b.crossed || a.meters - b.meters);
  const w = walk(from, target.tile, p.hazards);
  const best = options[0] ?? null;
  const move: Required<Move> & { from: string } = {
    target: target.id,
    from,
    meters: w.meters,
    crossed: w.crossed,
    best: best?.t.id ?? null,
    bestMeters: best?.meters ?? null,
    bestCrossed: best?.crossed ?? null,
  };
  return { move, route: w.route, bestRoute: best?.route ?? null };
}

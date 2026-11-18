import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP } from "./campus.ts";
import { ranked, routeStep } from "./gladi.ts";
import { boardOf, routeMove, targets } from "./gladiBoard.ts";
import { INTENSITY, campusRisks, hazardTiles, safeAssembly, type Scenario } from "./sim.ts";

const main = { floors: 2, material: "bata_tanpa_tulangan" as const, built_year: 1995 };
const site = { soil: "lunak" as const, coast_km: 0.8, rain_30d_mm: 300 };

test("on every campus and hazard, the engine's own best move scores at least as well as any other", () => {
  for (const kind of MAP.disasters) {
    const s: Scenario = { kind, intensity: INTENSITY[kind].start };
    const risks = campusRisks(main, site, s, 2026);
    const hazards = hazardTiles(s, risks);
    const p = { risks, hazards, goals: safeAssembly(s, hazards) };
    const board = boardOf(kind, s.intensity, p);
    const from = ranked(board.risks)[0];
    const options = targets(kind, from);
    assert.ok(options.length > 0, `${MAP.id} ${kind}: somewhere to go`);
    const scores = options.map((t) => routeStep(kind, board, routeMove(kind, board, p, from, t).move).score);
    const best = routeMove(kind, board, p, from, options[0]).move.best;
    if (!best) continue;
    const bestScore = routeStep(kind, board, routeMove(kind, board, p, from, options.find((t) => t.id === best)!).move).score;
    assert.equal(bestScore, Math.max(...scores), `${MAP.id} ${kind}: best ${best} scores ${bestScore}, others ${scores}`);
  }
});

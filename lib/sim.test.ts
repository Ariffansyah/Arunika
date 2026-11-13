import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSEMBLY, GRID, SPAWN, W, WARDEN, isBlocked, tileAt } from "./campus.ts";
import { bestRoute, campusRisks, hazardTiles, pathLength, safeAssembly, scoreDrill, type Scenario } from "./sim.ts";
import { parseAssessment } from "./assessment.ts";

const main = { floors: 2, material: "beton_bertulang" as const, built_year: 2000 };
const site = { soil: "sedang" as const, coast_km: 0.5, rain_30d_mm: 250 };

test("campus grid is rectangular and has its landmarks", () => {
  assert.ok(GRID.every((row) => row.length === W));
  assert.ok(SPAWN && WARDEN);
  assert.equal(ASSEMBLY.length, 2);
});

function routeFor(s: Scenario) {
  const hazards = hazardTiles(s, campusRisks(main, site, s, 2026));
  return bestRoute(GRID, SPAWN, safeAssembly(s, hazards), hazards);
}

test("quake route is walkable, step by step, and ends at an assembly point", () => {
  const path = routeFor({ kind: "gempa", intensity: 6.5 });
  assert.ok(path);
  for (const [x, z] of path) assert.ok(!isBlocked(x, z));
  for (let i = 1; i < path.length; i++) {
    assert.ok(Math.abs(path[i][0] - path[i - 1][0]) <= 1 && Math.abs(path[i][1] - path[i - 1][1]) <= 1);
  }
  assert.ok("AB".includes(tileAt(...path.at(-1)!)));
});

test("a 1 m flood sends everyone to the hill, not the low field", () => {
  const path = routeFor({ kind: "banjir", intensity: 1 });
  assert.equal(tileAt(...path!.at(-1)!), "A");
});

test("boxed-in start has no route", () => {
  const grid = ["=====", "=.=.=", "=====", "=...="];
  assert.equal(bestRoute(grid, [1, 1], [[3, 1]], new Set()), null);
});

test("route detours around hazards when a dry path exists", () => {
  const grid = [".....", ".....", "....."];
  const hazards = new Set([1 * 5 + 1, 1 * 5 + 2, 1 * 5 + 3]);
  const path = bestRoute(grid, [0, 1], [[4, 1]], hazards)!;
  assert.ok(path.every(([x, z]) => !hazards.has(z * 5 + x)));
  assert.ok(pathLength(path) > 4);
});

test("scoring: no assembly point means zero, a clean run scores at least 1000", () => {
  const base = { scenario: { kind: "gempa", intensity: 6 } as Scenario, timeS: 15, walked: 20, optimalLen: 20, hazardS: 0, hintUsed: false };
  assert.equal(scoreDrill({ ...base, reached: false, coverS: 8 }), 0);
  assert.ok(scoreDrill({ ...base, reached: true, coverS: 8 }) >= 1000);
});

test("assessment parser rejects junk and clamps scores", () => {
  assert.equal(parseAssessment("nope"), null);
  assert.equal(parseAssessment({ score: 50 }), null);
  const a = parseAssessment({
    is_building: true,
    score: 140,
    level: "tinggi",
    summary: "Dinding retak",
    observations: ["retak diagonal", 3],
    recommendations: [{ action: "Pasang kolom praktis", priority: "segera", cost_band: "sedang" }, { action: "x" }],
  });
  assert.equal(a?.score, 100);
  assert.equal(a?.observations.length, 1);
  assert.equal(a?.recommendations.length, 1);
});

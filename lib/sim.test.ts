import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSEMBLY, GRID, SPAWN, W, WARDEN, isBlocked, tileAt } from "./campus.ts";
import {
  bestRoute,
  campusRisks,
  grade,
  hazardTiles,
  pathLength,
  safeAssembly,
  scoreDrill,
  shakeSeconds,
  timeline,
  type Scenario,
  type Tracked,
} from "./sim.ts";
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

const model: Tracked = {
  reached: true,
  shakeS: 13.5,
  coverS: 13.5,
  deskS: 13.5,
  shakeMoved: 0,
  nearFallS: 0,
  runIndoorS: 0,
  reentered: false,
  debrisS: 0,
  aftershockS: 4,
  aftershockCoverS: 4,
  aftershockIndoorS: 0,
  powerOff: true,
  alarm: true,
  deepWaterS: 0,
};

test("earthquake checklist: a model drill scores 1000+, ducking in the open scores less, not reporting scores 0", () => {
  const base = { scenario: { kind: "gempa", intensity: 6.5 } as Scenario, timeS: 60, walked: 70, optimalLen: 70, leadS: 13.5, hintUsed: false };
  const checks = grade("gempa", model);
  assert.ok(checks.every((c) => c.ok));
  assert.equal(checks.reduce((sum, c) => sum + c.max, 0), 1000);
  assert.ok(scoreDrill({ ...base, reached: true, checks }) >= 1000);
  const ducked = grade("gempa", { ...model, deskS: 0 });
  assert.ok(scoreDrill({ ...base, reached: true, checks: ducked }) < scoreDrill({ ...base, reached: true, checks }));
  assert.equal(scoreDrill({ ...base, reached: false, checks: grade("gempa", { ...model, reached: false }) }), 0);
});

test("flood checklist totals 1000 and marks power left on and deep wading", () => {
  assert.equal(grade("banjir", model).reduce((sum, c) => sum + c.max, 0), 1000);
  assert.equal(grade("banjir", { ...model, powerOff: false }).filter((c) => !c.ok).length, 1);
  assert.equal(grade("banjir", { ...model, deepWaterS: 10 }).filter((c) => !c.ok).length, 1);
});

test("bigger quakes shake longer, and a seed gives every player the same aftershock", () => {
  assert.ok(shakeSeconds(8) > shakeSeconds(6));
  const quake = { kind: "gempa", intensity: 7 } as Scenario;
  assert.deepEqual(timeline(quake, 42), timeline(quake, 42));
  assert.ok(timeline(quake, 42).aftershock![0] > timeline(quake, 42).shake![1]);
  assert.equal(timeline({ kind: "gempa", intensity: 5.5 }, 42).aftershock, null);
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

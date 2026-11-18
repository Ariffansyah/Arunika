import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSEMBLY, BUILDINGS, GRID, H, MAP, SPAWN, W, WARDEN, isBlocked, tileAt, tileCenter, tileElevation } from "./campus.ts";
import {
  bestRoute,
  campusRisks,
  evacuationSigns,
  grade,
  hazardTiles,
  inRunout,
  pathLength,
  safeAssembly,
  scoreDrill,
  shakeSeconds,
  timeline,
  vortexAt,
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

test("a 1 m flood sends everyone to high ground, or upstairs where there is none", () => {
  const s: Scenario = { kind: "banjir", intensity: 1 };
  const path = routeFor(s);
  if (path) assert.ok(tileElevation(...path.at(-1)!) > 1.2, "route ends above the water");
  else assert.ok(Object.values(BUILDINGS).some((b) => b.floors > 1), "an upper floor to climb to");
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
  leftAt: 4,
  runWaterS: 0,
  deepWaterS: 0,
  sheltered: true,
  windS: 15,
  windCoverS: 15,
  windWindowS: 0,
  windExposedS: 0,
  leftShelter: false,
  signSeen: true,
  caught: false,
  slopeS: 0,
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

test("flood checklist totals 1000 and marks a slow start, running in water and deep wading", () => {
  assert.equal(grade("banjir", model).reduce((sum, c) => sum + c.max, 0), 1000);
  const slow = grade("banjir", { ...model, leftAt: 25 })[0];
  assert.ok(!slow.ok && slow.got === 75);
  assert.equal(grade("banjir", { ...model, leftAt: -1 })[0].pending, true);
  assert.equal(grade("banjir", { ...model, runWaterS: 3 }).filter((c) => !c.ok).length, 1);
  assert.equal(grade("banjir", { ...model, deepWaterS: 10 }).filter((c) => !c.ok).length, 1);
});

test("landslide checklist totals 1000 and asks nothing of the player but reading the slope and leaving it", () => {
  assert.equal(grade("longsor", model).reduce((sum, c) => sum + c.max, 0), 1000);
  assert.equal(grade("longsor", { ...model, signSeen: false }).filter((c) => !c.ok).length, 1);
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

test("whirlwind and landslide checklists total 1000 and fail the deadly mistakes", () => {
  for (const kind of ["angin", "longsor"] as const) assert.equal(grade(kind, model).reduce((sum, c) => sum + c.max, 0), 1000);
  assert.ok(!grade("angin", { ...model, sheltered: false }).find((c) => c.max === 300)!.ok);
  assert.ok(!grade("longsor", { ...model, caught: true }).find((c) => c.max === 300)!.ok);
});

test("a landslide leaves a safe assembly point off the slope, and buildings below it are most at risk", { skip: !MAP.runouts.length }, () => {
  const s: Scenario = { kind: "longsor", intensity: 200 };
  const risks = campusRisks(main, site, s, 2026);
  const goals = safeAssembly(s, hazardTiles(s, risks));
  assert.ok(goals.length >= 1);
  for (const g of goals) assert.ok(!inRunout(...tileCenter(...g)) && tileAt(...g) !== "A", "off the slope and off the hill");
  const ranked = Object.entries(risks).sort((a, b) => b[1] - a[1]);
  assert.ok(ranked[0][1] > ranked.at(-1)![1], `${ranked[0][0]} below the slope is more at risk`);
});

test("a whirlwind has no open-air assembly point and crosses the campus on a seeded path", () => {
  const s: Scenario = { kind: "angin", intensity: 110 };
  assert.deepEqual(safeAssembly(s, hazardTiles(s, campusRisks(main, site, s, 2026))), []);
  const tl = timeline(s, 7);
  assert.equal(vortexAt(tl, tl.wind![0] - 1), null);
  const mid = vortexAt(tl, (tl.wind![0] + tl.wind![1]) / 2)!;
  assert.ok(mid[0] > 0 && mid[0] < 120, "halfway through, it is over the campus");
});

test("evacuation signs point toward an assembly point", () => {
  // Walking cost from every tile to the nearest assembly point, with the router's moves.
  const dist = new Array(W * H).fill(Infinity);
  const queue: [number, number, number][] = ASSEMBLY.map(([x, z]) => [x, z, 0]);
  ASSEMBLY.forEach(([x, z]) => (dist[z * W + x] = 0));
  while (queue.length) {
    queue.sort((a, b) => a[2] - b[2]);
    const [x, z, d] = queue.shift()!;
    if (d > dist[z * W + x]) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [nx, nz] = [x + dx, z + dz];
      if (isBlocked(nx, nz) || (dx && dz && (isBlocked(x + dx, z) || isBlocked(x, z + dz)))) continue;
      const nd = d + Math.hypot(dx, dz);
      if (nd < dist[nz * W + nx]) {
        dist[nz * W + nx] = nd;
        queue.push([nx, nz, nd]);
      }
    }
  }
  const signs = evacuationSigns();
  assert.ok(signs.length >= 6, `${signs.length} signs`);
  for (const s of signs) {
    // Panel axes on the ground: x to the reader's right, "up" straight ahead for whoever reads the front.
    const right = [Math.cos(s.ry), -Math.sin(s.ry)];
    const ahead = [-Math.sin(s.ry), -Math.cos(s.ry)];
    const front = [0, 1].map((i) => Math.cos(s.arrow) * right[i] + Math.sin(s.arrow) * ahead[i]);
    const [px, pz] = s.tile;
    const to = [px + Math.round(2 * front[0]), pz + Math.round(2 * front[1])];
    assert.ok(dist[to[1] * W + to[0]] < dist[pz * W + px], `sign at ${px},${pz} points away from safety`);
    assert.ok(!isBlocked(Math.floor(s.x / 3), Math.floor(s.z / 3)), "post stands on open ground");
  }
});

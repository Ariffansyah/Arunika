import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSEMBLY, MAP, tileCenter } from "./campus.ts";
import { PLAN } from "./floorplan.ts";
import { cellCenter, distanceAt, flowField, free, upperFloorAt } from "./nav.ts";
import { fallenBox, situation } from "./situation.ts";
import { INTENSITY, type Scenario } from "./sim.ts";

const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);
const scenarios: Scenario[] = MAP.disasters.map((kind) => ({ kind, intensity: INTENSITY[kind].start }));

test("a seed always gives the same situation, and seeds differ", () => {
  for (const s of scenarios) {
    assert.deepEqual(situation(s, 42), situation(s, 42));
    const briefs = new Set(seeds.map((seed) => situation(s, seed).brief));
    assert.ok(briefs.size >= 4, `${s.kind}: ${briefs.size} different starts`);
  }
  const quakes = seeds.map((seed) => situation(scenarios[0], seed));
  assert.ok(quakes.some((q) => q.fallen) && quakes.some((q) => !q.fallen), "trees fall in some quakes, not all");
});

test("every start spot is open ground with a way out, even past a fallen tree", () => {
  for (const s of scenarios) {
    for (const seed of seeds.slice(0, 12)) {
      const sit = situation(s, seed);
      const trunk = sit.fallen ? fallenBox(sit.fallen) : null;
      const field = flowField(
        (layer, k) => {
          const [x, z] = cellCenter(k);
          return (layer === 0 && ASSEMBLY.some((a) => Math.hypot(...tileCenter(...a).map((v, i) => v - [x, z][i])) < 4.5)) || (layer === 1 && upperFloorAt(x, z));
        },
        () => 0,
        (layer, k) => {
          const [x, z] = cellCenter(k);
          return !!trunk && layer === 0 && x > trunk.x0 - 0.3 && x < trunk.x1 + 0.3 && z > trunk.z0 - 0.3 && z < trunk.z1 + 0.3;
        },
      );
      const layer = sit.room?.floor ?? 0;
      if (sit.place !== "kelas") assert.ok(sit.spots.length >= 16, `${sit.brief}: ${sit.spots.length} spots`);
      for (const [x, z] of sit.spots.slice(0, 16)) {
        assert.ok(free(x, z, layer, 0.3), `${sit.brief} at ${x.toFixed(1)},${z.toFixed(1)}`);
        const d = Math.min(...[-0.5, 0, 0.5].flatMap((dx) => [-0.5, 0, 0.5].map((dz) => distanceAt(field, x + dx, z + dz, layer))));
        assert.ok(Number.isFinite(d), `${sit.brief} at ${x.toFixed(1)},${z.toFixed(1)} is shut in`);
      }
      if (sit.lockedRoom) assert.ok(PLAN.rooms.find((r) => r.id === sit.lockedRoom)?.shelter);
    }
  }
});

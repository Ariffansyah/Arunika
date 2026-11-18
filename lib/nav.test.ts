import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSEMBLY, SITE_W, TILE, buildingRects, tileCenter } from "./campus.ts";
import { PLAN, classrooms } from "./floorplan.ts";
import {
  LOW_FENCE,
  N,
  buildingAt,
  cellCenter,
  cellOf,
  distanceAt,
  flowField,
  free,
  groundY,
  layerAt,
  nextStep,
  routeFrom,
  routeLength,
  upperFloorAt,
  vaultTarget,
} from "./nav.ts";

const assembly = flowField(
  (layer, k) => layer === 0 && ASSEMBLY.some((a) => Math.hypot(...tileCenter(...a).map((v, i) => v - cellCenter(k)[i])) < 4.5),
  () => 0,
);
const seatLayer = (room: string) => PLAN.rooms.find((r) => r.id === room)!.floor;
// A walker's own cell can sit just inside a desk's clearance; its neighbours cannot all be blocked.
const reach = (x: number, z: number, layer: number) =>
  Math.min(
    ...[-0.5, 0, 0.5].flatMap((dx) => [-0.5, 0, 0.5].map((dz) => distanceAt(assembly, x + dx, z + dz, layer))),
  );

test("walls block and seats are clear", () => {
  const wall = PLAN.parts.find((p) => p.kind === "wall" && p.x1 - p.x0 > 2)!;
  assert.equal(free((wall.x0 + wall.x1) / 2, (wall.z0 + wall.z1) / 2, wall.floor), false);
  for (const s of PLAN.seats) assert.ok(free(s.x, s.z, seatLayer(s.room)), `seat in ${s.room}`);
});

test("every seat, upstairs included, has a walking route to an assembly point", () => {
  for (const s of PLAN.seats) assert.ok(Number.isFinite(reach(s.x, s.z, seatLayer(s.room))), `seat in ${s.room}`);
});

test("the upper floor reaches the ground only by the stairs", () => {
  const upstairs = classrooms().find((r) => r.floor === 1)!;
  const seat = PLAN.seats.find((s) => s.room === upstairs.id)!;
  const route = routeFrom(assembly, seat.x, seat.z, 1);
  const end = route.at(-1)!;
  assert.ok(routeLength(route) > 40);
  assert.ok(end[1] < PLAN.floorY["1"] + 1, "route ends on the ground");
  assert.ok(route.some(([x, , z]) => PLAN.ramps.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)), "route uses the stairs");
});

test("in a flood, a ground-floor class climbs to the upper floor, not into the stairwell's void", () => {
  const refuge = flowField((layer, k) => layer === 1 && upperFloorAt(...cellCenter(k)), () => 0);
  const seat = PLAN.seats.find((s) => s.room === classrooms()[0].id)!;
  const end = routeFrom(refuge, seat.x, seat.z, 0).at(-1)!;
  assert.ok(end[1] > PLAN.floorY["1"] + 3.9, "route ends a storey up");
});

test("every seat can reach a whirlwind shelter room", () => {
  const shelters = PLAN.rooms.filter((r) => r.shelter);
  const field = flowField((layer, k) => {
    const [x, z] = cellCenter(k);
    return shelters.some((r) => r.floor === layer && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
  }, () => 0);
  for (const s of PLAN.seats) {
    const layer = seatLayer(s.room);
    const d = Math.min(...[-0.5, 0, 0.5].flatMap((dx) => [-0.5, 0, 0.5].map((dz) => distanceAt(field, s.x + dx, s.z + dz, layer))));
    assert.ok(Number.isFinite(d), `seat in ${s.room}`);
  }
});

test("routes never pass through a wall", () => {
  for (const room of classrooms()) {
    const seat = PLAN.seats.find((s) => s.room === room.id)!;
    const route = routeFrom(assembly, seat.x, seat.z, room.floor);
    assert.ok(routeLength(route) > 10, room.name);
    for (let i = 1; i < route.length; i++) {
      const [ax, ay, az] = route[i - 1];
      const [bx, by, bz] = route[i];
      const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
      // Any wall between two route points covers the midpoint; the route is clear on one floor or the other.
      const layer = Math.min(ay, by) > PLAN.floorY["1"] + 2 ? 1 : 0;
      assert.ok(free(mx, mz, layer, 0.05) || free(mx, mz, 1 - layer, 0.05), `${room.name} at ${mx.toFixed(2)},${mz.toFixed(2)}`);
    }
  }
});

test("every room can be left on foot", () => {
  const outside = flowField((layer, k) => layer === 0 && !buildingAt(...cellCenter(k)), () => 0);
  for (const r of PLAN.rooms) {
    let ok = false;
    for (let z = r.z0 + 0.25; z < r.z1 && !ok; z += 0.5) {
      for (let x = r.x0 + 0.25; x < r.x1 && !ok; x += 0.5) ok = Number.isFinite(outside[r.floor * N + cellOf(x, z)]);
    }
    assert.ok(ok, `${r.name} in ${r.b}`);
  }
});

test("stepping onto the upper flight changes floor and height follows the steps", () => {
  const [, landing, flightB] = PLAN.ramps;
  const x = (flightB.x0 + flightB.x1) / 2;
  assert.equal(layerAt(x, (flightB.z0 + flightB.z1) / 2, 0), 1);
  assert.equal(layerAt((landing.x0 + landing.x1) / 2, (landing.z0 + landing.z1) / 2, 1), 0);
  const top = groundY(x, flightB.c0, 1);
  const bottom = groundY(x, flightB.c1, 1);
  assert.ok(top - bottom > 1.9);
  assert.ok(nextStep(assembly, x, (flightB.z0 + flightB.z1) / 2, 1));
});

test("a low railing can be jumped, but not the site fence, a wall, or open ground", () => {
  const east = Math.PI / 2;
  // Somewhere along the railings, from just in front of one, a jump across it lands clear on the far side.
  const jumps = LOW_FENCE.flatMap((f) =>
    f.sx < f.sz
      ? [vaultTarget(f.x - 0.5, f.z, east), vaultTarget(f.x + 0.5, f.z, -east)]
      : [vaultTarget(f.x, f.z - 0.5, 0), vaultTarget(f.x, f.z + 0.5, Math.PI)],
  ).filter((j) => j !== null);
  assert.ok(jumps.length > LOW_FENCE.length / 2, `${jumps.length} of ${LOW_FENCE.length * 2} railing jumps`);
  for (const j of jumps) assert.ok(free(j.x, j.z, 0), "lands clear");
  assert.equal(vaultTarget(SITE_W / 2, 1.4, Math.PI), null, "site fence is too tall");
  const r = buildingRects()["1"];
  assert.equal(vaultTarget(r.x0 * TILE - 0.4, (r.z0 + 1.5) * TILE, east), null, "building wall");
  assert.equal(vaultTarget(...tileCenter(...ASSEMBLY[1]), east), null, "nothing to jump");
});

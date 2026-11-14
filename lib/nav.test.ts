import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSEMBLY, tileCenter } from "./campus.ts";
import { PLAN, classrooms } from "./floorplan.ts";
import { N, buildingAt, cellCenter, cellOf, distanceAt, flowField, free, groundY, layerAt, nextStep, routeFrom, routeLength } from "./nav.ts";

const assembly = flowField(
  (layer, k) => layer === 0 && ASSEMBLY.some((a) => Math.hypot(...tileCenter(...a).map((v, i) => v - cellCenter(k)[i])) < 4.5),
  () => false,
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

test("every room can be left on foot", () => {
  const outside = flowField((layer, k) => layer === 0 && !buildingAt(...cellCenter(k)), () => false);
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

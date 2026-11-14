import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN, STOREY, classrooms } from "./floorplan.ts";

test("every classroom seats 32 students", () => {
  const rooms = classrooms();
  assert.equal(rooms.length, 9);
  for (const r of rooms) assert.equal(PLAN.seats.filter((s) => s.room === r.id).length, 32);
});

test("parts are real boxes and doors open along a wall's normal", () => {
  for (const p of PLAN.parts) assert.ok(p.x1 > p.x0 && p.y1 > p.y0 && p.z1 > p.z0, `${p.kind} in ${p.b}`);
  for (const d of PLAN.doors) assert.equal(Math.abs(d.out[0]) + Math.abs(d.out[1]), 1);
});

test("the stairs climb one storey without a jump", () => {
  const [flightA, landing, flightB] = PLAN.ramps;
  const y0 = PLAN.floorY["1"];
  assert.equal(flightA.y0, y0);
  assert.equal(flightA.y1, landing.y0);
  assert.equal(flightB.y1, landing.y0);
  assert.equal(flightB.y0, y0 + STOREY);
  assert.deepEqual([flightA.layer, landing.layer, flightB.layer], [0, 0, 1]);
});

"use client";

import { useMemo } from "react";
import { GRID, SPAWN, TILE, buildingRects, elevationAt, isBlocked, tileCenter, tileElevation } from "@/lib/campus";
import { bestRoute, hazardTiles, safeAssembly, type Scenario } from "@/lib/sim";

const LINE = "#f3f1ea";
const at = (x: number, z: number) => Math.max(0.03, elevationAt(x, z));

function Strip({ x, z, w, d, y = 0.04, color = LINE }: { x: number; z: number; w: number; d: number; y?: number; color?: string }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, at(x, z) + y, z]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function SoccerField() {
  const [x0, x1, z0, z1] = [48.9, 83.1, 39.9, 68.1];
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const t = 0.12;
  return (
    <>
      <Strip x={cx} z={z0} w={x1 - x0} d={t} />
      <Strip x={cx} z={z1} w={x1 - x0} d={t} />
      <Strip x={x0} z={cz} w={t} d={z1 - z0} />
      <Strip x={x1} z={cz} w={t} d={z1 - z0} />
      <Strip x={cx} z={cz} w={t} d={z1 - z0} />
      <mesh rotation-x={-Math.PI / 2} position={[cx, at(cx, cz) + 0.04, cz]}>
        <ringGeometry args={[4, 4 + t, 64]} />
        <meshStandardMaterial color={LINE} />
      </mesh>
      {[x0, x1].map((gx, i) => {
        const dir = i === 0 ? 1 : -1;
        return (
          <group key={gx}>
            <Strip x={gx + dir * 2.5} z={cz - 6} w={5} d={t} />
            <Strip x={gx + dir * 2.5} z={cz + 6} w={5} d={t} />
            <Strip x={gx + dir * 5} z={cz} w={t} d={12} />
            <group position={[gx - dir * 0.05, at(gx, cz), cz]}>
              {[-2.5, 2.5].map((dz) => (
                <mesh key={dz} position={[0, 1, dz]} castShadow>
                  <boxGeometry args={[0.1, 2, 0.1]} />
                  <meshStandardMaterial color="#ffffff" />
                </mesh>
              ))}
              <mesh position={[0, 2, 0]} castShadow>
                <boxGeometry args={[0.1, 0.1, 5.1]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[-dir * 0.6, 1, 0]}>
                <boxGeometry args={[1.2, 2, 5]} />
                <meshStandardMaterial color="#ffffff" transparent opacity={0.18} />
              </mesh>
            </group>
          </group>
        );
      })}
    </>
  );
}

function BasketballCourt() {
  const [x0, x1, z0, z1] = [72.45, 86.55, 3.45, 20.55];
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const t = 0.1;
  return (
    <>
      <Strip x={cx} z={z0} w={x1 - x0} d={t} />
      <Strip x={cx} z={z1} w={x1 - x0} d={t} />
      <Strip x={x0} z={cz} w={t} d={z1 - z0} />
      <Strip x={x1} z={cz} w={t} d={z1 - z0} />
      <Strip x={cx} z={cz} w={x1 - x0} d={t} />
      {[z0 + 0.45, z1 - 0.45].map((hz, i) => {
        const dir = i === 0 ? 1 : -1;
        return (
          <group key={hz} position={[cx, at(cx, hz), hz]}>
            <mesh position={[0, 1.8, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 3.6, 8]} />
              <meshStandardMaterial color="#55606e" />
            </mesh>
            <mesh position={[0, 3.4, dir * 0.25]} castShadow>
              <boxGeometry args={[1.8, 1.05, 0.05]} />
              <meshStandardMaterial color="#f7f7f2" />
            </mesh>
            <mesh position={[0, 3.05, dir * 0.63]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.23, 0.02, 6, 24]} />
              <meshStandardMaterial color="#e2622a" />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function Gate() {
  return (
    <group position={[60, 0, 82.5]}>
      {[-3.3, 3.3].map((dx) => (
        <mesh key={dx} position={[dx, 1.6, 0]} castShadow>
          <boxGeometry args={[0.6, 3.2, 0.6]} />
          <meshStandardMaterial color="#efe6d4" />
        </mesh>
      ))}
      <mesh position={[0, 3.5, 0]} castShadow>
        <boxGeometry args={[7.2, 0.6, 0.6]} />
        <meshStandardMaterial color="#1f6b45" />
      </mesh>
      <mesh position={[0, 3.9, 0]}>
        <boxGeometry args={[7.6, 0.18, 0.8]} />
        <meshStandardMaterial color="#b4532a" />
      </mesh>
    </group>
  );
}

function Bench({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  return (
    <group position={[x, at(x, z), z]} rotation-y={ry}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.8, 0.06, 0.42]} />
        <meshStandardMaterial color="#9a6a42" />
      </mesh>
      {[-0.75, 0.75].map((dx) => (
        <mesh key={dx} position={[dx, 0.22, 0]}>
          <boxGeometry args={[0.06, 0.44, 0.38]} />
          <meshStandardMaterial color="#4f5662" />
        </mesh>
      ))}
    </group>
  );
}

// Indonesian schools sort waste three ways: organic (green), inorganic (yellow), hazardous (red).
function Bins({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, at(x, z), z]}>
      {["#2f9e5b", "#e8b82e", "#d9483b"].map((c, i) => (
        <mesh key={c} position={[(i - 1) * 0.6, 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.25, 0.22, 0.8, 14]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
}

function WaterTower({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, at(x, z), z]}>
      {[
        [-0.9, -0.9],
        [0.9, -0.9],
        [-0.9, 0.9],
        [0.9, 0.9],
      ].map(([dx, dz]) => (
        <mesh key={`${dx}${dz}`} position={[dx, 3, dz]} castShadow>
          <boxGeometry args={[0.15, 6, 0.15]} />
          <meshStandardMaterial color="#6d737d" />
        </mesh>
      ))}
      <mesh position={[0, 6.9, 0]} castShadow>
        <cylinderGeometry args={[1.2, 1.2, 1.8, 20]} />
        <meshStandardMaterial color="#2e7fc2" />
      </mesh>
    </group>
  );
}

function MushollaDome() {
  const r = buildingRects()["6"];
  const x = ((r.x0 + r.x1 + 1) / 2) * TILE;
  const z = ((r.z0 + r.z1 + 1) / 2) * TILE;
  const y = Math.min(tileElevation(r.x0, r.z0), tileElevation(r.x1, r.z1)) - 0.1 + 4 + 1.6;
  return (
    <group position={[x, y, z]}>
      <mesh castShadow>
        <sphereGeometry args={[2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2c8a5a" />
      </mesh>
      <mesh position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 1, 6]} />
        <meshStandardMaterial color="#e2c56a" />
      </mesh>
    </group>
  );
}

const FLOOD: Scenario = { kind: "banjir", intensity: 1 };

// Signs follow the route the planner computes, so they always point the right way.
function EvacuationSigns() {
  const signs = useMemo(() => {
    const hazards = hazardTiles(FLOOD, {});
    const route = bestRoute(GRID, SPAWN, safeAssembly(FLOOD, hazards), hazards) ?? [];
    const out: { x: number; z: number; angle: number }[] = [];
    for (let i = 3; i + 1 < route.length; i += 7) {
      const [ax, az] = route[i];
      const [bx, bz] = route[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      const [cx, cz] = tileCenter(ax, az);
      const sx = cx + (dz / len) * 2.4;
      const sz = cz - (dx / len) * 2.4;
      if (isBlocked(Math.floor(sx / TILE), Math.floor(sz / TILE))) continue;
      // The panel faces the camera (south), so "up" on the sign means north.
      out.push({ x: sx, z: sz, angle: Math.atan2(-dz, dx) });
    }
    return out;
  }, []);

  return signs.map((s, i) => (
    <group key={i} position={[s.x, at(s.x, s.z), s.z]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.2, 6]} />
        <meshStandardMaterial color="#cfd6de" />
      </mesh>
      <group position={[0, 2.1, 0.03]}>
        <mesh castShadow>
          <boxGeometry args={[0.62, 0.42, 0.04]} />
          <meshStandardMaterial color="#108a4a" />
        </mesh>
        <group position={[0, 0, 0.03]} rotation-z={s.angle}>
          <mesh>
            <boxGeometry args={[0.32, 0.06, 0.01]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          {[1, -1].map((side) => (
            <mesh key={side} position={[0.11, side * 0.05, 0]} rotation-z={side * 0.8}>
              <boxGeometry args={[0.16, 0.06, 0.01]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  ));
}

export default function Decor() {
  return (
    <>
      <SoccerField />
      <BasketballCourt />
      <Gate />
      <MushollaDome />
      <WaterTower x={112.8} z={76.8} />
      <Bench x={34.8} z={45.9} />
      <Bench x={31.5} z={69.3} />
      <Bench x={75.9} z={30.6} />
      <Bench x={88.8} z={64.8} ry={Math.PI / 2} />
      <Bins x={90} z={76.8} />
      <Bins x={7.8} z={25.2} />
      <EvacuationSigns />
    </>
  );
}

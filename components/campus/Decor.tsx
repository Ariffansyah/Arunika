"use client";

import { useMemo } from "react";
import { GRID, SPAWN, buildingRects, elevationAt, isBlocked, tileElevation } from "@/lib/campus";
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
  const [x0, x1, z0, z1] = [16.3, 27.7, 13.3, 22.7];
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const t = 0.09;
  return (
    <>
      <Strip x={cx} z={z0} w={x1 - x0} d={t} />
      <Strip x={cx} z={z1} w={x1 - x0} d={t} />
      <Strip x={x0} z={cz} w={t} d={z1 - z0} />
      <Strip x={x1} z={cz} w={t} d={z1 - z0} />
      <Strip x={cx} z={cz} w={t} d={z1 - z0} />
      <mesh rotation-x={-Math.PI / 2} position={[cx, at(cx, cz) + 0.04, cz]}>
        <ringGeometry args={[2.1, 2.1 + t, 48]} />
        <meshStandardMaterial color={LINE} />
      </mesh>
      {[x0, x1].map((gx, i) => {
        const dir = i === 0 ? 1 : -1;
        return (
          <group key={gx}>
            <Strip x={gx + dir * 1.2} z={cz - 2.5} w={2.4} d={t} />
            <Strip x={gx + dir * 1.2} z={cz + 2.5} w={2.4} d={t} />
            <Strip x={gx + dir * 2.4} z={cz} w={t} d={5} />
            <group position={[gx - dir * 0.05, at(gx, cz), cz]}>
              {[-1.5, 1.5].map((dz) => (
                <mesh key={dz} position={[0, 0.55, dz]} castShadow>
                  <boxGeometry args={[0.08, 1.1, 0.08]} />
                  <meshStandardMaterial color="#ffffff" />
                </mesh>
              ))}
              <mesh position={[0, 1.1, 0]} castShadow>
                <boxGeometry args={[0.08, 0.08, 3.08]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[-dir * 0.35, 0.55, 0]}>
                <boxGeometry args={[0.7, 1.1, 3]} />
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
  const [x0, x1, z0, z1] = [24.15, 28.85, 1.15, 6.85];
  const cx = (x0 + x1) / 2;
  const t = 0.07;
  return (
    <>
      <Strip x={cx} z={z0} w={x1 - x0} d={t} />
      <Strip x={cx} z={z1} w={x1 - x0} d={t} />
      <Strip x={x0} z={4} w={t} d={z1 - z0} />
      <Strip x={x1} z={4} w={t} d={z1 - z0} />
      <Strip x={cx} z={4} w={x1 - x0} d={t} />
      {[z0 + 0.15, z1 - 0.15].map((hz, i) => {
        const dir = i === 0 ? 1 : -1;
        return (
          <group key={hz} position={[cx, at(cx, hz), hz]}>
            <mesh position={[0, 1.2, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
              <meshStandardMaterial color="#55606e" />
            </mesh>
            <mesh position={[0, 2.25, dir * 0.12]} castShadow>
              <boxGeometry args={[0.9, 0.55, 0.05]} />
              <meshStandardMaterial color="#f7f7f2" />
            </mesh>
            <mesh position={[0, 2.05, dir * 0.36]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.2, 0.025, 6, 20]} />
              <meshStandardMaterial color="#e2622a" />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function Gate() {
  const z = 27.5;
  return (
    <group position={[20, 0, z]}>
      {[-1.35, 1.35].map((dx) => (
        <mesh key={dx} position={[dx, 1.4, 0]} castShadow>
          <boxGeometry args={[0.45, 2.8, 0.45]} />
          <meshStandardMaterial color="#efe6d4" />
        </mesh>
      ))}
      <mesh position={[0, 2.95, 0]} castShadow>
        <boxGeometry args={[3.3, 0.4, 0.5]} />
        <meshStandardMaterial color="#1f6b45" />
      </mesh>
      <mesh position={[0, 3.25, 0]}>
        <boxGeometry args={[3.5, 0.12, 0.6]} />
        <meshStandardMaterial color="#b4532a" />
      </mesh>
    </group>
  );
}

function Bench({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  return (
    <group position={[x, at(x, z), z]} rotation-y={ry}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[1.3, 0.07, 0.36]} />
        <meshStandardMaterial color="#9a6a42" />
      </mesh>
      {[-0.55, 0.55].map((dx) => (
        <mesh key={dx} position={[dx, 0.2, 0]}>
          <boxGeometry args={[0.07, 0.4, 0.32]} />
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
        <mesh key={c} position={[(i - 1) * 0.42, 0.27, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.15, 0.54, 12]} />
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
        [-0.45, -0.45],
        [0.45, -0.45],
        [-0.45, 0.45],
        [0.45, 0.45],
      ].map(([dx, dz]) => (
        <mesh key={`${dx}${dz}`} position={[dx, 1.4, dz]} castShadow>
          <boxGeometry args={[0.08, 2.8, 0.08]} />
          <meshStandardMaterial color="#6d737d" />
        </mesh>
      ))}
      <mesh position={[0, 3.25, 0]} castShadow>
        <cylinderGeometry args={[0.65, 0.65, 0.95, 16]} />
        <meshStandardMaterial color="#2e7fc2" />
      </mesh>
    </group>
  );
}

function MushollaDome() {
  const r = buildingRects()["6"];
  const x = (r.x0 + r.x1 + 1) / 2;
  const z = (r.z0 + r.z1 + 1) / 2;
  const y = Math.min(tileElevation(r.x0, r.z0), tileElevation(r.x1, r.z1)) - 0.1 + 1.5 + 1.0;
  return (
    <group position={[x, y, z]}>
      <mesh castShadow>
        <sphereGeometry args={[0.7, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2c8a5a" />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.35, 6]} />
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
      const sx = ax + 0.5 + (dz / len) * 0.8;
      const sz = az + 0.5 - (dx / len) * 0.8;
      if (isBlocked(Math.floor(sx), Math.floor(sz))) continue;
      // The panel faces the camera (south), so "up" on the sign means north.
      out.push({ x: sx, z: sz, angle: Math.atan2(-dz, dx) });
    }
    return out;
  }, []);

  return signs.map((s, i) => (
    <group key={i} position={[s.x, at(s.x, s.z), s.z]}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 1.7, 6]} />
        <meshStandardMaterial color="#cfd6de" />
      </mesh>
      <group position={[0, 1.65, 0.03]}>
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
      <WaterTower x={37.6} z={25.6} />
      <Bench x={11.6} z={15.3} />
      <Bench x={10.5} z={23.1} />
      <Bench x={25.3} z={10.2} />
      <Bench x={29.6} z={21.6} ry={Math.PI / 2} />
      <Bins x={30.0} z={25.6} />
      <Bins x={2.6} z={8.4} />
      <EvacuationSigns />
    </>
  );
}

"use client";

import { useMemo } from "react";
import { CanvasTexture, SRGBColorSpace, Shape, ShapeGeometry, Vector2 } from "three";
import { GATE, MAP, TILE, elevationAt, findTiles } from "@/lib/campus";
import type { Rect } from "@/lib/maps";
import { evacuationSigns } from "@/lib/sim";

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

// Bounds in metres of a set of tiles, pulled in by `inset`.
function bounds(tiles: [number, number][], inset: number) {
  const xs = tiles.map((t) => t[0]);
  const zs = tiles.map((t) => t[1]);
  return [Math.min(...xs) * TILE + inset, (Math.max(...xs) + 1) * TILE - inset, Math.min(...zs) * TILE + inset, (Math.max(...zs) + 1) * TILE - inset];
}

function SoccerField() {
  const [x0, x1, z0, z1] = bounds(findTiles("gB"), 0.9);
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

function BasketballCourt({ court }: { court: Rect }) {
  const [x0, x1, z0, z1] = bounds(
    [
      [court[0], court[1]],
      [court[2], court[3]],
    ],
    0.45,
  );
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const t = 0.1;
  // The hoops stand at the ends of the longer side; each turns to face into the court.
  const alongX = x1 - x0 > z1 - z0;
  const hoops: [number, number, number][] = alongX
    ? [
        [x0 + 0.45, cz, Math.PI / 2],
        [x1 - 0.45, cz, -Math.PI / 2],
      ]
    : [
        [cx, z0 + 0.45, 0],
        [cx, z1 - 0.45, Math.PI],
      ];
  return (
    <>
      <Strip x={cx} z={z0} w={x1 - x0} d={t} />
      <Strip x={cx} z={z1} w={x1 - x0} d={t} />
      <Strip x={x0} z={cz} w={t} d={z1 - z0} />
      <Strip x={x1} z={cz} w={t} d={z1 - z0} />
      {alongX ? <Strip x={cx} z={cz} w={t} d={z1 - z0} /> : <Strip x={cx} z={cz} w={x1 - x0} d={t} />}
      {hoops.map(([hx, hz, ry]) => (
        <group key={`${hx}-${hz}`} position={[hx, at(hx, hz), hz]} rotation-y={ry}>
          <mesh position={[0, 1.8, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 3.6, 8]} />
            <meshStandardMaterial color="#55606e" />
          </mesh>
          <mesh position={[0, 3.4, 0.25]} castShadow>
            <boxGeometry args={[1.8, 1.05, 0.05]} />
            <meshStandardMaterial color="#f7f7f2" />
          </mesh>
          <mesh position={[0, 3.05, 0.63]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.23, 0.02, 6, 24]} />
            <meshStandardMaterial color="#e2622a" />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Gate() {
  return (
    <group position={[GATE[0], 0, GATE[1]]}>
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

const SIGNS = evacuationSigns();

// White on green, as on Indonesian evacuation signs.
function signLabel() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 48;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#108a4a";
  g.fillRect(0, 0, 256, 48);
  g.fillStyle = "#ffffff";
  g.font = "bold 30px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("JALUR EVAKUASI", 128, 26);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const HEAD = new ShapeGeometry(new Shape([new Vector2(0.18, 0), new Vector2(0.04, 0.12), new Vector2(0.04, -0.12)]));

// A shaft along +x ending in a solid head, turned to `angle` on the panel.
function Arrow({ angle, z }: { angle: number; z: number }) {
  return (
    <group position={[0, 0.06, z]} rotation-z={angle}>
      <mesh position={[-0.05, 0, 0]}>
        <planeGeometry args={[0.2, 0.07]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} />
      </mesh>
      <mesh geometry={HEAD}>
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

// The back of a post sign is bare metal, as on real ones: the route is signed one way.
function EvacuationSigns() {
  const label = useMemo(() => signLabel(), []);
  return SIGNS.map((s, i) => (
    <group key={i} position={[s.x, at(s.x, s.z), s.z]} rotation-y={s.ry}>
      <mesh position={[0, 1.2, -0.08]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
        <meshStandardMaterial color="#cfd6de" />
      </mesh>
      <group position={[0, 2.15, 0]}>
        <mesh position={[0, 0, -0.025]} castShadow>
          <boxGeometry args={[0.68, 0.52, 0.02]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.66, 0.5, 0.03]} />
          {/* Sign faces are retroreflective, so they stay readable in shade. */}
          <meshStandardMaterial color="#108a4a" emissive="#108a4a" emissiveIntensity={0.35} />
        </mesh>
        <Arrow angle={s.arrow} z={0.017} />
        <mesh position={[0, -0.17, 0.017]}>
          <planeGeometry args={[0.62, 0.116]} />
          <meshStandardMaterial map={label} emissiveMap={label} emissive="#ffffff" emissiveIntensity={0.35} />
        </mesh>
      </group>
    </group>
  ));
}

export default function Decor() {
  const { benches, bins, waterTower } = MAP.decor;
  return (
    <>
      <SoccerField />
      {MAP.court && <BasketballCourt court={MAP.court} />}
      <Gate />
      <WaterTower x={waterTower[0]} z={waterTower[1]} />
      {benches.map(([x, z, ry]) => (
        <Bench key={`${x}-${z}`} x={x} z={z} ry={ry} />
      ))}
      {bins.map(([x, z]) => (
        <Bins key={`${x}-${z}`} x={x} z={z} />
      ))}
      <EvacuationSigns />
    </>
  );
}

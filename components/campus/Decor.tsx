"use client";

import { useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { ASSEMBLY, GATE, MAP, TILE, elevationAt, findTiles, tileCenter } from "@/lib/campus";
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
const GREEN = "#0f8a4a";

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = GREEN;
  g.fillRect(0, 0, w, h);
  Object.assign(g, { fillStyle: "#ffffff", strokeStyle: "#ffffff", lineCap: "round", lineJoin: "round" });
  draw(g);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// The running figure of the evacuation sign, heading out through a doorway on its right; `flip` turns it left.
function runner(g: CanvasRenderingContext2D, x: number, y: number, flip: boolean) {
  g.save();
  g.translate(x, y);
  g.scale(flip ? -1 : 1, 1);
  g.lineWidth = 7;
  g.strokeRect(30, -62, 46, 124);
  g.beginPath();
  g.arc(-4, -44, 12, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 15;
  const limb = (...pts: number[]) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  };
  limb(-10, -24, -22, 10);
  limb(-12, -20, 6, -8, 18, -24);
  limb(-12, -20, -30, -6, -42, -16);
  limb(-22, 10, -2, 26, -2, 54);
  limb(-22, 10, -34, 34, -54, 38);
  g.restore();
}

// A block arrow pointing along `angle`, 0 to the right and π/2 straight up.
function arrow(g: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number) {
  g.save();
  g.translate(x, y);
  g.rotate(-angle);
  g.beginPath();
  for (const [px, py] of [[1, 0], [0.1, -0.62], [0.1, -0.24], [-1, -0.24], [-1, 0.24], [0.1, 0.24], [0.1, 0.62]]) g.lineTo(px * size, py * size);
  g.fill();
  g.restore();
}

// Evacuation route sign faces, one per arrow: figure and arrow above, the words below, the figure running the arrow's way.
const signFaces = new Map<number, CanvasTexture>();
function signFace(angle: number) {
  if (!signFaces.has(angle)) {
    const left = angle > Math.PI / 2 + 0.1;
    signFaces.set(
      angle,
      canvasTexture(384, 256, (g) => {
        g.lineWidth = 6;
        g.strokeRect(8, 8, 368, 240);
        runner(g, left ? 262 : 122, 98, left);
        arrow(g, left ? 96 : 288, 98, 58, angle);
        g.font = "bold 36px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("JALUR EVAKUASI", 192, 212);
      }),
    );
  }
  return signFaces.get(angle)!;
}

// The assembly point sign: four people round a point, arrows pointing in, and its name.
function assemblyFace() {
  return canvasTexture(320, 400, (g) => {
    g.lineWidth = 8;
    g.strokeRect(10, 10, 300, 380);
    g.lineWidth = 7;
    g.strokeRect(40, 40, 240, 240);
    for (const [x, y] of [[90, 90], [230, 90], [90, 230], [230, 230]]) {
      g.beginPath();
      g.arc(x, y - 22, 13, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.roundRect(x - 16, y - 4, 32, 44, 10);
      g.fill();
    }
    for (const [x, y, a] of [[160, 82, -Math.PI / 2], [160, 238, Math.PI / 2], [82, 160, 0], [238, 160, Math.PI]]) arrow(g, x, y, 26, a);
    g.font = "bold 46px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("TITIK", 160, 318);
    g.fillText("KUMPUL", 160, 362);
  });
}

function Post({ height }: { height: number }) {
  return (
    <mesh position={[0, height / 2, -0.06]} castShadow>
      <cylinderGeometry args={[0.04, 0.04, height, 6]} />
      <meshStandardMaterial color="#cfd6de" />
    </mesh>
  );
}

// A panel of `w` by `h` on its metal backing, the face lit a little so the retroreflective sheet reads in shade.
function Panel({ w, h, face, back }: { w: number; h: number; face: CanvasTexture; back?: boolean }) {
  return (
    <>
      <mesh position={[0, 0, -0.02]} castShadow>
        <boxGeometry args={[w + 0.02, h + 0.02, 0.02]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={face} emissiveMap={face} emissive="#ffffff" emissiveIntensity={0.3} />
      </mesh>
      {back && (
        <mesh position={[0, 0, -0.041]} rotation-y={Math.PI}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={face} emissiveMap={face} emissive="#ffffff" emissiveIntensity={0.3} />
        </mesh>
      )}
    </>
  );
}

// The back of a route sign is bare metal, as on real ones: the route is signed one way.
function EvacuationSigns() {
  return SIGNS.map((s, i) => (
    <group key={i} position={[s.x, at(s.x, s.z), s.z]} rotation-y={s.ry}>
      <Post height={2.5} />
      <group position={[0, 2.2, 0]}>
        <Panel w={0.72} h={0.48} face={signFace(s.arrow)} />
      </group>
    </group>
  ));
}

// Beside every assembly point, readable from both sides since people arrive from all round.
function AssemblySigns() {
  const face = useMemo(() => assemblyFace(), []);
  return ASSEMBLY.map(([x, z]) => {
    const [cx, cz] = tileCenter(x, z);
    return (
      <group key={`${x}-${z}`} position={[cx, at(cx, cz - 5.1), cz - 5.1]}>
        <Post height={2.9} />
        <group position={[0, 2.35, 0]}>
          <Panel w={0.64} h={0.8} face={face} back />
        </group>
      </group>
    );
  });
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
      <AssemblySigns />
    </>
  );
}

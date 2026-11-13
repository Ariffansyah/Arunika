"use client";

import { Line } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type ComponentRef } from "react";
import type { Group, Mesh } from "three";
import Character, { preloadCharacters, type Look } from "@/components/Character";
import { Backdrop, Buildings, Coast, Props, Terrain } from "@/components/campus/World";
import { ASSEMBLY, GRID, H, SPAWN, W, elevationAt, tileElevation } from "@/lib/campus";
import { bestRoute, hazardTiles, safeAssembly, type Scenario } from "@/lib/sim";

const FLOOD: Scenario = { kind: "banjir", intensity: 1.1 };
const LOOP_S = 18;
const WALK_SPEED = 2.2;

type Clock = { current: number };
type Pts = readonly (readonly [number, number])[];

// Story of one loop: tide rises through the first half while students walk the computed route up the hill.
function useRoute() {
  return useMemo(() => {
    const hazards = hazardTiles(FLOOD, {});
    const tiles = bestRoute(GRID, SPAWN, safeAssembly(FLOOD, hazards), hazards) ?? [SPAWN];
    const pts: Pts = tiles.map(([x, z]) => [x + 0.5, z + 0.5] as const);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum };
  }, []);
}

// Deterministic scatter so the surroundings look the same on every load.
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function Tick({ clockRef, paused }: { clockRef: Clock; paused: boolean }) {
  useFrame((_, dt) => {
    if (!paused) clockRef.current += Math.min(dt, 0.1);
  });
  return null;
}

/** Sways around one viewpoint instead of circling, so the sunrise and the framing stay put. */
function Camera({ clockRef }: { clockRef: Clock }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const aspect = size.width / size.height;
  const k = Math.min(2.2, Math.max(1, 1.2 / aspect));

  useEffect(() => {
    // Wide screens: push the campus right of the headline. Portrait: lift it above the text.
    if (aspect > 1.15) camera.setViewOffset(size.width, size.height, -size.width * 0.17, -size.height * 0.1, size.width, size.height);
    else camera.setViewOffset(size.width, size.height, 0, size.height * 0.1, size.width, size.height);
    return () => camera.clearViewOffset();
  }, [camera, size, aspect]);

  useFrame(() => {
    const a = 1.2 + Math.sin(clockRef.current * 0.07) * 0.32;
    camera.position.set(W / 2 + Math.cos(a) * 38 * k, 15 * k, H / 2 + Math.sin(a) * 38 * k);
    camera.lookAt(W / 2, 2.5, H / 2 - 3);
  });
  return null;
}

function Water({ clockRef }: { clockRef: Clock }) {
  const ref = useRef<Mesh>(null);
  const baseRef = useRef<Float32Array | null>(null);
  useFrame(() => {
    const t = clockRef.current;
    const p = (t % LOOP_S) / LOOP_S;
    const level = p < 0.5 ? (p / 0.5) * FLOOD.intensity : p < 0.85 ? FLOOD.intensity : ((1 - p) / 0.15) * FLOOD.intensity;
    const m = ref.current;
    if (!m) return;
    m.position.y = level;
    m.visible = level > 0.03;
    if (!m.visible) return;
    const pos = m.geometry.attributes.position;
    baseRef.current ??= Float32Array.from(pos.array);
    const base = baseRef.current;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.sin(base[i * 3] * 0.45 + t * 1.3) * 0.06 + Math.sin(base[i * 3 + 1] * 0.6 - t * 0.9) * 0.05);
    }
    pos.needsUpdate = true;
    m.geometry.computeVertexNormals();
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[W / 2, 0, H / 2]}>
      <planeGeometry args={[W + 90, H + 90, 72, 56]} />
      <meshPhongMaterial color="#3a8fc6" specular="#ffe2c2" shininess={70} transparent opacity={0.7} />
    </mesh>
  );
}

function Route({ clockRef, pts }: { clockRef: Clock; pts: Pts }) {
  const ref = useRef<ComponentRef<typeof Line>>(null);
  const points = useMemo(() => pts.map(([x, z]) => [x, elevationAt(x, z) + 0.3, z] as [number, number, number]), [pts]);
  useFrame(() => {
    if (ref.current) ref.current.material.dashOffset = -clockRef.current * 1.6;
  });
  if (points.length < 2) return null;
  return <Line ref={ref} points={points} color="#ff8a3d" lineWidth={6} dashed dashSize={0.7} gapSize={0.4} />;
}

const STUDENTS: Look[] = ["a", "b", "c", "e", "f", "k", "m", "n"];
preloadCharacters(STUDENTS);

function Student({ clockRef, pts, cum, delay, i }: { clockRef: Clock; pts: Pts; cum: number[]; delay: number; i: number }) {
  const ref = useRef<Group>(null);
  const walking = useRef(false);
  useFrame(() => {
    const g = ref.current;
    if (!g || pts.length < 2) return;
    const total = cum[cum.length - 1];
    const stop = total - 0.4 - i * 0.55;
    const d = Math.max(0, ((clockRef.current % LOOP_S) - delay) * WALK_SPEED);
    const dist = Math.min(d, stop);
    walking.current = d > 0 && d < stop;
    let s = 1;
    while (s < cum.length - 1 && cum[s] < dist) s++;
    const f = Math.min(1, Math.max(0, (dist - cum[s - 1]) / (cum[s] - cum[s - 1] || 1)));
    const dx = pts[s][0] - pts[s - 1][0];
    const dz = pts[s][1] - pts[s - 1][1];
    const len = Math.hypot(dx, dz) || 1;
    const side = ((i % 3) - 1) * 0.35;
    const x = pts[s - 1][0] + dx * f - (dz / len) * side;
    const z = pts[s - 1][1] + dz * f + (dx / len) * side;
    g.position.set(x, elevationAt(x, z), z);
    g.rotation.y = Math.atan2(dx, dz);
  });
  return (
    <group ref={ref}>
      <Character look={STUDENTS[i % STUDENTS.length]} height={1.6} speed={1.4} anim={() => (walking.current ? "walk" : "idle")} />
    </group>
  );
}

function Flag({ clockRef }: { clockRef: Clock }) {
  const flag = useRef<Group>(null);
  useFrame(() => {
    if (flag.current) flag.current.rotation.y = Math.sin(clockRef.current * 2.1) * 0.18;
  });
  const [x, z] = [20.5, 24.5];
  return (
    <group position={[x, elevationAt(x, z), z]}>
      <mesh position={[0, 2.6, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 5.2, 8]} />
        <meshStandardMaterial color="#d8dde3" metalness={0.4} roughness={0.4} />
      </mesh>
      <group ref={flag} position={[0.05, 4.6, 0]}>
        <mesh position={[0.6, 0.2, 0]}>
          <planeGeometry args={[1.2, 0.4]} />
          <meshStandardMaterial color="#d7261e" side={2} />
        </mesh>
        <mesh position={[0.6, -0.2, 0]}>
          <planeGeometry args={[1.2, 0.4]} />
          <meshStandardMaterial color="#f7f7f2" side={2} />
        </mesh>
      </group>
    </group>
  );
}

type PalmSpec = { x: number; z: number; h: number; lean: number; turn: number };

function Palm({ x, z, h, lean, turn }: PalmSpec) {
  return (
    <group position={[x, 0.05, z]} rotation={[0, turn, lean]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.17, h, 6]} />
        <meshStandardMaterial color="#8a6a48" />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i} position={[0, h, 0]} rotation={[0, (i / 7) * Math.PI * 2, 0]}>
          <mesh position={[0.75, -0.18, 0]} rotation={[0, 0, -0.45]} castShadow>
            <boxGeometry args={[1.6, 0.04, 0.32]} />
            <meshStandardMaterial color={i % 2 ? "#3f8a3e" : "#4f9a46"} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

type HouseSpec = { x: number; z: number; w: number; d: number; wall: string; turn: number };

function House({ x, z, w, d, wall, turn }: HouseSpec) {
  return (
    <group position={[x, 0, z]} rotation-y={turn}>
      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 1.3, d]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <group position={[0, 1.75, 0]} scale={[(w + 0.4) / Math.SQRT2, 1, (d + 0.4) / Math.SQRT2]}>
        <mesh rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[1, 0.9, 4]} />
          <meshStandardMaterial color="#a8472a" flatShading />
        </mesh>
      </group>
    </group>
  );
}

const WALLS = ["#efe2c8", "#e6d3b0", "#d9e3e0", "#f0d9c4"];

function Surroundings() {
  const { houses, palms } = useMemo(() => {
    // Village belts west, north and east of the school wall; the south side is the beach.
    const houses: HouseSpec[] = Array.from({ length: 26 }, (_, i) => {
      const band = i % 3;
      const r = rand(i);
      const q = rand(i + 50);
      return {
        x: band === 0 ? -4 - r * 16 : band === 1 ? -6 + r * (W + 12) : W + 4 + r * 16,
        z: band === 1 ? -4 - q * 14 : -6 + q * (H + 4),
        w: 1.6 + rand(i + 9) * 1.2,
        d: 1.4 + rand(i + 19),
        wall: WALLS[i % WALLS.length],
        turn: Math.round(rand(i + 7) * 3) * (Math.PI / 2) + (rand(i + 3) - 0.5) * 0.3,
      };
    });
    const palms: PalmSpec[] = Array.from({ length: 16 }, (_, i) => ({
      x: -8 + (i / 15) * (W + 16) + (rand(i + 70) - 0.5) * 2,
      z: H + 1.2 + rand(i + 90) * 2.2,
      h: 2.8 + rand(i + 30) * 1.6,
      lean: (rand(i + 40) - 0.5) * 0.35,
      turn: rand(i + 60) * Math.PI * 2,
    }));
    return { houses, palms };
  }, []);

  return (
    <>
      {/* Grass apron north of the beach line so the campus doesn't float in the fog. */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0.03, (H - 160) / 2]} receiveShadow>
        <planeGeometry args={[320, 160 + H]} />
        <meshStandardMaterial color="#6f8f4c" />
      </mesh>
      {houses.map((h, i) => (
        <House key={i} {...h} />
      ))}
      {palms.map((p, i) => (
        <Palm key={i} {...p} />
      ))}
      {/* Volcano and ridge on the horizon; the fog turns them into dawn silhouettes. */}
      <mesh position={[W / 2 - 40, 24, -190]}>
        <cylinderGeometry args={[5, 70, 48, 14]} />
        <meshStandardMaterial color="#7d8794" flatShading />
      </mesh>
      <mesh position={[W / 2 + 60, 12, -170]}>
        <coneGeometry args={[60, 24, 12]} />
        <meshStandardMaterial color="#7a8a86" flatShading />
      </mesh>
      <mesh position={[W / 2 - 120, 10, -150]}>
        <coneGeometry args={[55, 20, 12]} />
        <meshStandardMaterial color="#7a8a86" flatShading />
      </mesh>
    </>
  );
}

function AssemblyRings() {
  return ASSEMBLY.map(([x, z]) => (
    <mesh key={`${x}-${z}`} rotation-x={-Math.PI / 2} position={[x + 0.5, tileElevation(x, z) + 0.05, z + 0.5]}>
      <ringGeometry args={[1.3, 1.6, 32]} />
      <meshStandardMaterial color="#34c47c" emissive="#34c47c" emissiveIntensity={0.4} />
    </mesh>
  ));
}

/** Non-interactive showcase of the campus: drifting camera, rising tide, students walking the AI route. */
export default function HeroScene({ paused, startAt = 0 }: { paused: boolean; startAt?: number }) {
  const clockRef = useRef(startAt);
  const { pts, cum } = useRoute();
  return (
    <Canvas shadows dpr={[1, 1.75]} frameloop={paused ? "demand" : "always"} camera={{ fov: 36, near: 0.5, far: 600 }}>
      <Backdrop sky={[-25, 4, -100]} light={[W / 2 + 32, 20, H / 2 - 26]} fog={[60, 260]} />
      <Surroundings />
      <Terrain />
      <Coast />
      <Props />
      <Buildings risks={{}} showRisk={false} />
      <Flag clockRef={clockRef} />
      <AssemblyRings />
      <Route clockRef={clockRef} pts={pts} />
      <Suspense fallback={null}>
        {STUDENTS.map((look, i) => (
          <Student key={look} i={i} clockRef={clockRef} pts={pts} cum={cum} delay={i * 0.35} />
        ))}
      </Suspense>
      <Water clockRef={clockRef} />
      <Camera clockRef={clockRef} />
      <Tick clockRef={clockRef} paused={paused} />
    </Canvas>
  );
}

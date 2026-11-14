"use client";

import { Line } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type ComponentRef } from "react";
import type { Group, Mesh } from "three";
import Character, { preloadCharacters, type Look } from "@/components/Character";
import Scenery from "@/components/campus/Scenery";
import { Buildings } from "@/components/campus/Building";
import { Backdrop, Coast, Props, Terrain } from "@/components/campus/World";
import { ASSEMBLY, GRID, SITE_D, SITE_W, SPAWN, elevationAt, tileCenter, tileElevation } from "@/lib/campus";
import { bestRoute, hazardTiles, safeAssembly, type Scenario } from "@/lib/sim";

const FLOOD: Scenario = { kind: "banjir", intensity: 1.1 };
const LOOP_S = 18;
const RUN_SPEED = 6.6;

type Clock = { current: number };
type Pts = readonly (readonly [number, number])[];

function useRoute() {
  return useMemo(() => {
    const hazards = hazardTiles(FLOOD, {});
    const tiles = bestRoute(GRID, SPAWN, safeAssembly(FLOOD, hazards), hazards) ?? [SPAWN];
    const pts: Pts = tiles.map(([x, z]) => tileCenter(x, z));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum };
  }, []);
}

function Tick({ clockRef, paused }: { clockRef: Clock; paused: boolean }) {
  useFrame((_, dt) => {
    if (!paused) clockRef.current += Math.min(dt, 0.1);
  });
  return null;
}

// Sways instead of circling so the sunrise and the framing stay put.
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
    camera.position.set(SITE_W / 2 + Math.cos(a) * 114 * k, 45 * k, SITE_D / 2 + Math.sin(a) * 114 * k);
    camera.lookAt(SITE_W / 2, 7.5, SITE_D / 2 - 9);
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
      pos.setZ(i, Math.sin(base[i * 3] * 0.15 + t * 1.3) * 0.08 + Math.sin(base[i * 3 + 1] * 0.2 - t * 0.9) * 0.06);
    }
    pos.needsUpdate = true;
    m.geometry.computeVertexNormals();
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[SITE_W / 2, 0, SITE_D / 2]}>
      <planeGeometry args={[SITE_W + 270, SITE_D + 270, 72, 56]} />
      <meshPhongMaterial color="#3a8fc6" specular="#ffe2c2" shininess={70} transparent opacity={0.7} />
    </mesh>
  );
}

function Route({ clockRef, pts }: { clockRef: Clock; pts: Pts }) {
  const ref = useRef<ComponentRef<typeof Line>>(null);
  const points = useMemo(() => pts.map(([x, z]) => [x, elevationAt(x, z) + 0.5, z] as [number, number, number]), [pts]);
  useFrame(() => {
    if (ref.current) ref.current.material.dashOffset = -clockRef.current * 4.8;
  });
  if (points.length < 2) return null;
  return <Line ref={ref} points={points} color="#ff8a3d" lineWidth={6} dashed dashSize={2.1} gapSize={1.2} />;
}

const STUDENTS: Look[] = ["female-c", "male-a", "female-b", "female-e", "male-f", "female-f", "male-a", "female-b"];
preloadCharacters(["female-c", "male-a", "female-b", "female-e", "male-f", "female-f"]);

function Student({ clockRef, pts, cum, delay, i }: { clockRef: Clock; pts: Pts; cum: number[]; delay: number; i: number }) {
  const ref = useRef<Group>(null);
  const walking = useRef(false);
  useFrame(() => {
    const g = ref.current;
    if (!g || pts.length < 2) return;
    const total = cum[cum.length - 1];
    const stop = total - 1.2 - i * 1.65;
    const d = Math.max(0, ((clockRef.current % LOOP_S) - delay) * RUN_SPEED);
    const dist = Math.min(d, stop);
    walking.current = d > 0 && d < stop;
    let s = 1;
    while (s < cum.length - 1 && cum[s] < dist) s++;
    const f = Math.min(1, Math.max(0, (dist - cum[s - 1]) / (cum[s] - cum[s - 1] || 1)));
    const dx = pts[s][0] - pts[s - 1][0];
    const dz = pts[s][1] - pts[s - 1][1];
    const len = Math.hypot(dx, dz) || 1;
    const side = ((i % 3) - 1) * 1.05;
    const x = pts[s - 1][0] + dx * f - (dz / len) * side;
    const z = pts[s - 1][1] + dz * f + (dx / len) * side;
    g.position.set(x, elevationAt(x, z), z);
    g.rotation.y = Math.atan2(dx, dz);
  });
  return (
    <group ref={ref}>
      <Character look={STUDENTS[i]} speed={1.2} anim={() => (walking.current ? "sprint" : "idle")} />
    </group>
  );
}

function AssemblyRings() {
  return ASSEMBLY.map(([x, z]) => {
    const [cx, cz] = tileCenter(x, z);
    return (
      <mesh key={`${x}-${z}`} rotation-x={-Math.PI / 2} position={[cx, tileElevation(x, z) + 0.08, cz]}>
        <ringGeometry args={[3.9, 4.8, 48]} />
        <meshStandardMaterial color="#34c47c" emissive="#34c47c" emissiveIntensity={0.4} />
      </mesh>
    );
  });
}

export default function HeroScene({ paused, startAt = 0 }: { paused: boolean; startAt?: number }) {
  const clockRef = useRef(startAt);
  const { pts, cum } = useRoute();
  return (
    <Canvas shadows="percentage" dpr={[1, 1.75]} frameloop={paused ? "demand" : "always"} camera={{ fov: 36, near: 0.5, far: 2000 }}>
      <Backdrop sky={[-25, 4, -100]} light={[SITE_W / 2 + 96, 60, SITE_D / 2 - 78]} fog={[180, 780]} />
      <Scenery />
      <Terrain />
      <Coast />
      <Props />
      <Buildings risks={{}} showRisk={false} />
      <AssemblyRings />
      <Route clockRef={clockRef} pts={pts} />
      <Suspense fallback={null}>
        {STUDENTS.map((s, i) => (
          <Student key={i} i={i} clockRef={clockRef} pts={pts} cum={cum} delay={i * 0.35} />
        ))}
      </Suspense>
      <Water clockRef={clockRef} />
      <Camera clockRef={clockRef} />
      <Tick clockRef={clockRef} paused={paused} />
    </Canvas>
  );
}

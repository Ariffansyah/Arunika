"use client";

import { Line } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type ComponentRef } from "react";
import type { Group, Mesh } from "three";
import { Backdrop, Buildings, Coast, Props, Terrain } from "@/components/campus/World";
import { ASSEMBLY, GRID, H, SPAWN, W, elevationAt, tileElevation } from "@/lib/campus";
import { bestRoute, hazardTiles, safeAssembly, type Scenario } from "@/lib/sim";
import { AVATAR_COLORS } from "@/lib/supabase";

const FLOOD: Scenario = { kind: "banjir", intensity: 1.2 };
const LOOP_S = 16;
const WALK_SPEED = 2.4;

type Clock = { current: number };

// The demo story: water rises over the first half of the loop while students walk the computed route to the hill.
function useRoute() {
  return useMemo(() => {
    const hazards = hazardTiles(FLOOD, {});
    const tiles = bestRoute(GRID, SPAWN, safeAssembly(FLOOD, hazards), hazards) ?? [SPAWN];
    const pts = tiles.map(([x, z]) => [x + 0.5, z + 0.5] as const);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { tiles, pts, cum };
  }, []);
}

function Tick({ clockRef, paused }: { clockRef: Clock; paused: boolean }) {
  useFrame((_, dt) => {
    if (!paused) clockRef.current += Math.min(dt, 0.1);
  });
  return null;
}

function Orbit({ clockRef }: { clockRef: Clock }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  // Portrait screens see a narrow slice; back the camera off so the whole campus stays in frame.
  const k = Math.min(2.1, Math.max(1, 1.15 / aspect));
  useFrame(() => {
    const a = 1.15 + clockRef.current * 0.035;
    camera.position.set(W / 2 + Math.cos(a) * 36 * k, 21 * k, H / 2 + Math.sin(a) * 36 * k);
    camera.lookAt(W / 2, 0, H / 2 - 2);
  });
  return null;
}

function Water({ clockRef }: { clockRef: Clock }) {
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const p = (clockRef.current % LOOP_S) / LOOP_S;
    const level = p < 0.55 ? (p / 0.55) * FLOOD.intensity : p < 0.85 ? FLOOD.intensity : ((1 - p) / 0.15) * FLOOD.intensity;
    if (ref.current) {
      ref.current.position.y = level;
      ref.current.visible = level > 0.02;
    }
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[W / 2, 0, H / 2]}>
      <planeGeometry args={[W + 80, H + 80]} />
      <meshStandardMaterial color="#2f6f9f" transparent opacity={0.72} roughness={0.2} />
    </mesh>
  );
}

function Route({ clockRef, pts }: { clockRef: Clock; pts: readonly (readonly [number, number])[] }) {
  const ref = useRef<ComponentRef<typeof Line>>(null);
  const points = useMemo(() => pts.map(([x, z]) => [x, elevationAt(x, z) + 0.25, z] as [number, number, number]), [pts]);
  useFrame(() => {
    if (ref.current) ref.current.material.dashOffset = -clockRef.current * 1.6;
  });
  if (points.length < 2) return null;
  return <Line ref={ref} points={points} color="#ff8a3d" lineWidth={5} dashed dashSize={0.7} gapSize={0.4} />;
}

function Walker({ clockRef, pts, cum, delay, color }: { clockRef: Clock; pts: readonly (readonly [number, number])[]; cum: number[]; delay: number; color: string }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g || pts.length < 2) return;
    const d = Math.max(0, ((clockRef.current % LOOP_S) - delay) * WALK_SPEED);
    const total = cum[cum.length - 1];
    const dist = Math.min(d, total - 0.6 - delay * 0.8);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < dist) i++;
    const f = Math.min(1, Math.max(0, (dist - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)));
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
    const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
    g.position.set(x, elevationAt(x, z), z);
    g.rotation.y = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.5, 6, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color="#f4ecdc" />
      </mesh>
    </group>
  );
}

function AssemblyRings() {
  return ASSEMBLY.map(([x, z]) => (
    <mesh key={`${x}-${z}`} rotation-x={-Math.PI / 2} position={[x + 0.5, tileElevation(x, z) + 0.05, z + 0.5]}>
      <ringGeometry args={[1.3, 1.6, 32]} />
      <meshStandardMaterial color="#34c47c" />
    </mesh>
  ));
}

/** Non-interactive showcase of the campus: orbiting camera, rising tide, students walking the AI route. */
export default function HeroScene({ paused, startAt = 0 }: { paused: boolean; startAt?: number }) {
  const clockRef = useRef(startAt);
  const { pts, cum } = useRoute();
  return (
    <Canvas shadows dpr={[1, 1.75]} frameloop={paused ? "demand" : "always"} camera={{ fov: 38, near: 0.1, far: 400 }}>
      <Backdrop />
      <Terrain />
      <Coast />
      <Props />
      <Buildings risks={{}} showRisk={false} />
      <AssemblyRings />
      <Route clockRef={clockRef} pts={pts} />
      {[0, 0.5, 1, 1.5, 2].map((delay, i) => (
        <Walker key={delay} clockRef={clockRef} pts={pts} cum={cum} delay={delay} color={AVATAR_COLORS[i]} />
      ))}
      <Water clockRef={clockRef} />
      <Orbit clockRef={clockRef} />
      <Tick clockRef={clockRef} paused={paused} />
    </Canvas>
  );
}

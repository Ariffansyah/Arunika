"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";
import Model, { M, preloadModels } from "@/components/Model";
import { ASSEMBLY, H, W, elevationAt } from "@/lib/campus";

preloadModels([...M.palms, ...M.trees, ...M.bushes, ...M.flowers, ...M.houses, M.tent, M.tentFrame, M.sign, M.crate, M.barrel, M.ambulance, M.police, M.cone]);

// Deterministic scatter so the surroundings are identical on every load and for every player.
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type Spot = { src: string; x: number; z: number; ry: number; size: number };

// Village in streets west, north and east of the school wall, facing the school; the south side is road and beach.
const HOUSES: Spot[] = [
  ...Array.from({ length: 11 }, (_, i) => ({ x: -5 + i * 4.6, z: -5, ry: 0 })),
  ...Array.from({ length: 8 }, (_, i) => ({ x: -3 + i * 6.3, z: -12, ry: Math.PI })),
  ...Array.from({ length: 6 }, (_, i) => ({ x: -6, z: 1 + i * 4.4, ry: Math.PI / 2 })),
  ...Array.from({ length: 6 }, (_, i) => ({ x: W + 6, z: 1 + i * 4.4, ry: -Math.PI / 2 })),
].map((p, i) => ({ ...p, x: p.x + (rand(i) - 0.5), src: M.houses[i % M.houses.length], size: 2.5 + rand(i + 40) * 0.6 }));

const VILLAGE_TREES: Spot[] = Array.from({ length: 12 }, (_, i) => {
  const side = i % 3;
  return {
    src: M.trees[i % M.trees.length],
    x: side === 0 ? -9.5 : side === 1 ? -4 + rand(i) * (W + 8) : W + 9.5,
    z: side === 1 ? -8.5 : 2 + rand(i + 9) * (H - 4),
    ry: rand(i + 3) * Math.PI * 2,
    size: 2.6 + rand(i + 5) * 1.4,
  };
});

const PALMS: Spot[] = Array.from({ length: 18 }, (_, i) => ({
  src: M.palms[i % M.palms.length],
  x: -10 + (i / 17) * (W + 20) + (rand(i + 70) - 0.5) * 1.6,
  z: H + 3.3 + rand(i + 90) * 2.6,
  ry: rand(i + 60) * Math.PI * 2,
  size: 3 + rand(i + 30) * 1.6,
}));

// Shrubs along the inside of the south and west walls, clear of the gate.
const BUSHES: Spot[] = [
  ...[2.5, 5, 7.5, 10.5, 13, 15.5, 24.5, 27.5, 30.5, 33, 36].map((x) => ({ x, z: 26.3 })),
  ...[15.5, 18, 20.5, 23, 25.5].map((z) => ({ x: 1.6, z })),
].map((p, i) => ({ ...p, src: M.bushes[i % M.bushes.length], ry: rand(i + 11) * Math.PI * 2, size: 0.8 + rand(i + 13) * 0.5 }));

const FLOWERS: Spot[] = [
  [19.2, 23.6],
  [21.8, 23.7],
  [19.4, 25.3],
  [21.6, 25.4],
].map(([x, z], i) => ({ x, z, src: M.flowers[i % 2], ry: rand(i) * 6, size: 0.45 }));

const at = (s: Spot, lift = 0) => [s.x, Math.max(0.03, elevationAt(s.x, s.z)) + lift] as const;

function Spots({ spots, by }: { spots: Spot[]; by: "height" | "width" }) {
  return spots.map((s, i) => {
    const [x, y] = at(s);
    return <Model key={i} src={s.src} fit={by === "height" ? { height: s.size } : { width: s.size }} position={[x, y, s.z]} rotation-y={s.ry} />;
  });
}

function Road() {
  return (
    <group position={[W / 2, 0.05, H + 1.35]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W + 80, 2.2]} />
        <meshStandardMaterial color="#555a63" roughness={0.9} />
      </mesh>
      {Array.from({ length: 22 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-40 + i * 4, 0.01, 0]}>
          <planeGeometry args={[1.6, 0.12]} />
          <meshStandardMaterial color="#e9e3d3" />
        </mesh>
      ))}
    </group>
  );
}

/** Emergency response parked outside the gate, with cones marking the way out. */
function Responders() {
  return (
    <>
      <Model src={M.ambulance} fit={{ width: 2.7 }} position={[15.6, 0.05, H + 1.35]} rotation-y={Math.PI / 2} />
      <Model src={M.police} fit={{ width: 2.6 }} position={[25.2, 0.05, H + 1.35]} rotation-y={-Math.PI / 2} />
      {[18.4, 21.6].map((x) => (
        <Model key={x} src={M.cone} fit={{ height: 0.55 }} position={[x, 0.05, H + 0.55]} />
      ))}
    </>
  );
}

/** An evacuation camp on the hill: tents, a signpost and supply crates around the assembly point. */
function Camp() {
  const items: { src: string; x: number; z: number; ry: number; h: number }[] = [
    { src: M.tent, x: 34.6, z: 2.4, ry: 0, h: 1.5 },
    { src: M.tent, x: 37.5, z: 5.2, ry: -Math.PI / 2, h: 1.5 },
    { src: M.tentFrame, x: 31.4, z: 2.6, ry: 0.4, h: 1.3 },
    { src: M.crate, x: 36.9, z: 2.3, ry: 0.3, h: 0.5 },
    { src: M.crate, x: 37.5, z: 2.9, ry: -0.2, h: 0.45 },
    { src: M.barrel, x: 32.7, z: 2.2, ry: 0, h: 0.6 },
  ];
  return items.map((it, i) => (
    <Model key={i} src={it.src} fit={{ height: it.h }} position={[it.x, elevationAt(it.x, it.z), it.z]} rotation-y={it.ry} />
  ));
}

function Signs() {
  return ASSEMBLY.map(([x, z]) => (
    <Model
      key={`${x}-${z}`}
      src={M.sign}
      fit={{ height: 1.7 }}
      position={[x + 0.5, elevationAt(x + 0.5, z - 1.2), z - 1.2]}
    />
  ));
}

function Flag() {
  const flag = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.1) * 0.18;
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

function Horizon() {
  return (
    <>
      {/* Grass apron north of the beach line so the campus doesn't float in the fog. */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0.03, (H - 160) / 2]} receiveShadow>
        <planeGeometry args={[320, 160 + H]} />
        <meshStandardMaterial color="#6f8f4c" />
      </mesh>
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

/** Everything around and on the campus that isn't part of the simulation: shared by the game and the landing page. */
export default function Scenery() {
  return (
    <>
      <Horizon />
      <Road />
      <Flag />
      <Suspense fallback={null}>
        <Spots spots={HOUSES} by="width" />
        <Spots spots={VILLAGE_TREES} by="height" />
        <Spots spots={PALMS} by="height" />
        <Spots spots={BUSHES} by="height" />
        <Spots spots={FLOWERS} by="height" />
        <Responders />
        <Camp />
        <Signs />
      </Suspense>
    </>
  );
}

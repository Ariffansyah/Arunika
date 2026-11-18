"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";
import Model, { Instances, M, preloadModels, type Placement } from "@/components/Model";
import Decor from "./Decor";
import Horizon from "./Horizon";
import { GATE, MAP, SITE_D, SITE_W, TILE, elevationAt, findTiles, surfaceAt, tileAt, tileCenter } from "@/lib/campus";

preloadModels([...M.palms, ...M.trees, ...M.pines, ...M.bushes, ...M.grass, ...M.flowers, ...M.houses, M.tent, M.tentFrame, M.crate, M.barrel, M.ambulance, M.police, M.cone]);

// Deterministic scatter so the surroundings are identical on every load and for every player.
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type Spot = { src: string; x: number; z: number; ry: number; size: number };

// Layout in grid tiles (scaled to metres below); sizes in metres.
const HOUSES: Spot[] = [
  ...Array.from({ length: 11 }, (_, i) => ({ x: -5 + i * 4.6, z: -5, ry: 0 })),
  ...Array.from({ length: 8 }, (_, i) => ({ x: -3 + i * 6.3, z: -12, ry: Math.PI })),
  ...Array.from({ length: 6 }, (_, i) => ({ x: -6, z: 1 + i * 4.4, ry: Math.PI / 2 })),
  ...Array.from({ length: 6 }, (_, i) => ({ x: SITE_W / TILE + 6, z: 1 + i * 4.4, ry: -Math.PI / 2 })),
].map((p, i) => ({
  ...p,
  x: (p.x + (rand(i) - 0.5)) * TILE,
  z: p.z * TILE,
  src: M.houses[i % M.houses.length],
  size: 7.5 + rand(i + 40) * 1.8,
}));

const VILLAGE_TREES: Spot[] = Array.from({ length: 12 }, (_, i) => {
  const side = i % 3;
  return {
    src: M.trees[i % M.trees.length],
    x: side === 0 ? -28.5 : side === 1 ? -12 + rand(i) * (SITE_W + 24) : SITE_W + 28.5,
    z: side === 1 ? -25.5 : 6 + rand(i + 9) * (SITE_D - 12),
    ry: rand(i + 3) * Math.PI * 2,
    size: 7.8 + rand(i + 5) * 4.2,
  };
});

const PALMS: Spot[] = Array.from({ length: 18 }, (_, i) => ({
  src: M.palms[i % M.palms.length],
  x: -30 + (i / 17) * (SITE_W + 60) + (rand(i + 70) - 0.5) * 4.8,
  z: SITE_D + 9.9 + rand(i + 90) * 7.8,
  ry: rand(i + 60) * Math.PI * 2,
  size: 9 + rand(i + 30) * 4.8,
}));

const [FLAG_X, FLAG_Z] = MAP.decor.flag;
const FLOWERS: Spot[] = [
  [-3.9, -2.7],
  [3.9, -2.4],
  [-3.3, 2.4],
  [3.3, 2.7],
].map(([dx, dz], i) => ({ x: FLAG_X + dx, z: FLAG_Z + dz, src: M.flowers[i % 2], ry: rand(i) * 6, size: 0.5 }));

// A hedge just inside the site fence wherever lawn meets it, two bushes to a tile.
const HEDGE: Placement[] = findTiles(".")
  .filter(([x, z]) => !surfaceAt(x, z))
  .flatMap(([x, z]) =>
    [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]
      .filter(([dx, dz]) => tileAt(x + dx, z + dz) === "=")
      .flatMap(([dx, dz]) => {
        const [cx, cz] = tileCenter(x, z);
        const [ex, ez] = [cx + dx * (TILE / 2 - 1.2), cz + dz * (TILE / 2 - 1.2)];
        return [-0.75, 0.75].map((k) => (dx ? [ex, ez + k] : [ex + k, ez]));
      }),
  )
  .map(([x, z], i) => {
    const s = 1.1 + rand(i + 200) * 0.5;
    return { x, y: elevationAt(x, z), z, ry: rand(i + 300) * Math.PI * 2, size: [s, s * 0.8, s] };
  });

function Hedge() {
  return M.bushes.map((src, k) => <Instances key={src} src={src} items={HEDGE.filter((_, i) => i % M.bushes.length === k)} />);
}

const at = (s: Spot, lift = 0) => [s.x, Math.max(0.03, elevationAt(s.x, s.z)) + lift] as const;

function Spots({ spots, by }: { spots: Spot[]; by: "height" | "width" }) {
  return spots.map((s, i) => {
    const [x, y] = at(s);
    return <Model key={i} src={s.src} fit={by === "height" ? { height: s.size } : { width: s.size }} position={[x, y, s.z]} rotation-y={s.ry} />;
  });
}

function Road() {
  return (
    <group position={[SITE_W / 2, 0.05, SITE_D + 4]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[SITE_W + 240, 6.6]} />
        <meshStandardMaterial color="#555a63" roughness={0.9} />
      </mesh>
      {Array.from({ length: 30 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-180 + i * 12, 0.01, 0]}>
          <planeGeometry args={[3, 0.15]} />
          <meshStandardMaterial color="#e9e3d3" />
        </mesh>
      ))}
    </group>
  );
}

// Parked on the road either side of the gate.
function Responders() {
  const [gx] = GATE;
  return (
    <>
      <Model src={M.ambulance} fit={{ width: 5.5 }} position={[gx - 13.2, 0.05, SITE_D + 4]} rotation-y={Math.PI / 2} />
      <Model src={M.police} fit={{ width: 4.8 }} position={[gx + 15.6, 0.05, SITE_D + 4]} rotation-y={-Math.PI / 2} />
      {[gx - 4.8, gx + 4.8].map((x) => (
        <Model key={x} src={M.cone} fit={{ height: 0.7 }} position={[x, 0.05, SITE_D + 1.65]} />
      ))}
    </>
  );
}

// Emergency tents beside the high assembly point, set back on whichever side has room inside the fence.
function Camp() {
  const [ax, az] = tileCenter(...findTiles("A")[0]);
  const fx = ax + 10 > SITE_W - 3 ? -1 : 1;
  const fz = az - 10 < 3 ? -1 : 1;
  const items: { src: string; x: number; z: number; ry: number; h: number }[] = [
    { src: M.tent, x: 0.3, z: -9.3, ry: 0, h: 2.2 },
    { src: M.tent, x: 9, z: -0.9, ry: -Math.PI / 2, h: 2.2 },
    { src: M.tentFrame, x: -9.3, z: -8.7, ry: 0.4, h: 2.4 },
    { src: M.crate, x: 7.2, z: -9.6, ry: 0.3, h: 0.6 },
    { src: M.crate, x: 9, z: -7.8, ry: -0.2, h: 0.55 },
    { src: M.barrel, x: -5.4, z: -9.9, ry: 0, h: 0.9 },
  ];
  return items.map((it, i) => {
    const [x, z] = [ax + fx * it.x, az + fz * it.z];
    return <Model key={i} src={it.src} fit={{ height: it.h }} position={[x, elevationAt(x, z), z]} rotation-y={it.ry} />;
  });
}

function Flag() {
  const flag = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.1) * 0.18;
  });
  const [x, z] = MAP.decor.flag;
  return (
    <group position={[x, elevationAt(x, z), z]}>
      <mesh position={[0, 4, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.09, 8, 8]} />
        <meshStandardMaterial color="#d8dde3" metalness={0.4} roughness={0.4} />
      </mesh>
      <group ref={flag} position={[0.06, 7.2, 0]}>
        <mesh position={[0.9, 0.3, 0]}>
          <planeGeometry args={[1.8, 0.6]} />
          <meshStandardMaterial color="#d7261e" side={2} />
        </mesh>
        <mesh position={[0.9, -0.3, 0]}>
          <planeGeometry args={[1.8, 0.6]} />
          <meshStandardMaterial color="#f7f7f2" side={2} />
        </mesh>
      </group>
    </group>
  );
}

export default function Scenery() {
  return (
    <>
      <Horizon />
      <Road />
      <Flag />
      <Decor />
      <Suspense fallback={null}>
        {MAP.id !== "kota" && <Spots spots={HOUSES} by="width" />}
        {MAP.id !== "kota" && <Spots spots={VILLAGE_TREES} by="height" />}
        {MAP.id === "pesisir" && <Spots spots={PALMS} by="height" />}
        <Hedge />
        <Spots spots={FLOWERS} by="height" />
        <Responders />
        <Camp />
      </Suspense>
    </>
  );
}

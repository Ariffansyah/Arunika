"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Object3D, RepeatWrapping, SRGBColorSpace, type Group, type InstancedMesh } from "three";
import { Instances, M, type Placement } from "@/components/Model";
import { MAP, SITE_D, SITE_W, TILE, elevationAt, findTiles, isBlocked, surfaceAt, tileAt } from "@/lib/campus";
import type { Setting } from "@/lib/maps";
import { random } from "@/lib/sim";
import { TIER, useDrill } from "./drillStore";

const CX = SITE_W / 2;
const CZ = SITE_D / 2;

// Light and air for each map at drill time, mid-morning: sea haze on the coast, mist in the mountains, a pale city sky.
// The sun stands high enough that rooms are lit by the sky and the shade under trees reads as noon-ish shade.
export const LOOK: Record<
  Setting,
  { sky: [number, number, number]; light: [number, number, number]; fog: [number, number]; fogColor: string; ground: string; sun: string }
> = {
  pesisir: { sky: [100, 62, -60], light: [CX + 80, 92, CZ - 60], fog: [160, 900], fogColor: "#cfdbe2", ground: "#6f8f4c", sun: "#fff1d9" },
  pegunungan: { sky: [100, 46, 40], light: [CX + 100, 84, CZ + 40], fog: [90, 620], fogColor: "#c9d5da", ground: "#5d8443", sun: "#fff4e3" },
  kota: { sky: [-30, 80, -40], light: [CX - 40, 104, CZ - 50], fog: [110, 620], fogColor: "#d3d5d1", ground: "#8f9283", sun: "#fff6ea" },
};

// A band of hills on a circle round the campus, from angle a0 to a1 (radians, 0 is east, π/2 south),
// its skyline drawn from a few sines so every map gets a different but fixed outline.
function Ridge({ radius, height, a0, a1, color, seed }: { radius: number; height: number; a0: number; a1: number; color: string; seed: number }) {
  const geometry = useMemo(() => {
    const rnd = random(seed);
    const waves = Array.from({ length: 4 }, (_, k) => [1 + k * 2 + rnd() * 2, rnd() * 6, 0.5 / (k + 1)]);
    const pos: number[] = [];
    const n = 96;
    for (let i = 0; i < n; i++) {
      const at = (j: number) => {
        const a = a0 + ((a1 - a0) * j) / n;
        const t = j / n;
        // Fades to nothing at both ends so a band never ends in a cliff.
        const edge = Math.min(1, t * 6, (1 - t) * 6);
        const h = height * edge * (0.55 + waves.reduce((s, [f, p, w]) => s + w * Math.sin(a * f * 3 + p), 0) * 0.5);
        return [CX + Math.cos(a) * radius, Math.max(2, h), CZ + Math.sin(a) * radius, CX + Math.cos(a) * (radius + 60), CZ + Math.sin(a) * (radius + 60)];
      };
      const [x0, y0, z0, bx0, bz0] = at(i);
      const [x1, y1, z1, bx1, bz1] = at(i + 1);
      // A sloped face toward the campus, from the foot to the crest set back behind it.
      pos.push(x0, -2, z0, bx0, y0, bz0, x1, -2, z1, x1, -2, z1, bx0, y0, bz0, bx1, y1, bz1);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  }, [radius, height, a0, a1, seed]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} flatShading side={2} />
    </mesh>
  );
}

function Volcano({ x, z, radius, height, color }: { x: number; z: number; radius: number; height: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2 - 2, 0]}>
        <cylinderGeometry args={[radius * 0.07, radius, height, 28, 3]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {/* Bare upper slopes and the crater rim. */}
      <mesh position={[0, height * 0.82, 0]}>
        <cylinderGeometry args={[radius * 0.07, radius * 0.3, height * 0.36, 28]} />
        <meshStandardMaterial color="#8a8178" flatShading />
      </mesh>
    </group>
  );
}

function Islands() {
  return [
    [-220, SITE_D + 360, 90, 34],
    [160, SITE_D + 430, 130, 46],
    [420, SITE_D + 330, 70, 22],
  ].map(([x, z, r, h]) => (
    <mesh key={x} position={[x, h / 2 - 3, z]} scale={[1, 1, 0.6]}>
      <coneGeometry args={[r, h, 10]} />
      <meshStandardMaterial color="#4f7a4a" flatShading />
    </mesh>
  ));
}

// Rice terraces climbing away from the campus on both sides, the river in the valley below the road.
function Valley() {
  const ref = useRef<InstancedMesh>(null);
  const steps = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; y: number; c: string }[] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 14; k++) {
        const x = side < 0 ? -70 - k * 9 : SITE_W + 70 + k * 9;
        out.push({ x, z: CZ - 20, w: 9, d: SITE_D + 120, y: 0.6 + k * 1.6, c: k % 2 ? "#7fae4a" : "#6c9c3d" });
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new Object3D();
    const c = new Color();
    steps.forEach((s, i) => {
      o.position.set(s.x, s.y / 2, s.z);
      o.scale.set(s.w, s.y, s.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(s.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [steps]);
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, steps.length]} receiveShadow>
        <boxGeometry />
        <meshStandardMaterial />
      </instancedMesh>
      <mesh rotation-x={-Math.PI / 2} position={[CX, 0.04, SITE_D + 24]}>
        <planeGeometry args={[SITE_W + 600, 18]} />
        <meshStandardMaterial color="#4f7f8c" roughness={0.25} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[CX, 0.035, SITE_D + 24]}>
        <planeGeometry args={[SITE_W + 600, 26]} />
        <meshStandardMaterial color="#a89a78" />
      </mesh>
    </>
  );
}

function windows() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 128);
  const rnd = random(5);
  for (let y = 6; y < 128; y += 16) {
    for (let x = 4; x < 64; x += 15) {
      g.fillStyle = rnd() < 0.25 ? "#e9dcb8" : "#5b6f85";
      g.fillRect(x, y, 10, 9);
    }
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(2, 3);
  return t;
}

// Shops, flats and office towers round the city campus, low next to it and taller further out.
function Skyline() {
  const ref = useRef<InstancedMesh>(null);
  const map = useMemo(() => windows(), []);
  const blocks = useMemo(() => {
    const rnd = random(23);
    const out: { x: number; z: number; w: number; d: number; h: number; c: string }[] = [];
    const palette = ["#c9c3b8", "#a9b4bf", "#d8cfc0", "#8e9aa6", "#bfb3a2", "#e2ddd3"];
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 80 + rnd() * 330;
      const x = CX + Math.cos(a) * r * 1.2;
      const z = CZ + Math.sin(a) * r;
      const w = 12 + rnd() * 16;
      if ((z > SITE_D - 10 && z < SITE_D + 36) || (x > -w && x < SITE_W + w && z > -w && z < SITE_D + w)) continue;
      out.push({ x, z, w, d: 12 + rnd() * 16, h: 8 + ((r - 80) / 330) * 75 * (0.4 + rnd()), c: palette[i % palette.length] });
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new Object3D();
    const c = new Color();
    blocks.forEach((b, i) => {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(b.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [blocks]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]}>
      <boxGeometry />
      <meshStandardMaterial map={map} />
    </instancedMesh>
  );
}

// Shophouses (ruko) along the far side of the road, each with its own awning colour.
function Ruko() {
  const map = useMemo(() => windows(), []);
  const items = useMemo(() => {
    const rnd = random(31);
    return Array.from({ length: 34 }, (_, i) => ({ x: -100 + i * 9.2, h: 7 + Math.floor(rnd() * 3) * 3.2, c: ["#e7d9bf", "#d6c4a8", "#f0e6d2", "#cfd6d9"][i % 4], a: ["#2f7d6b", "#c4572e", "#2e5d9b", "#b8862e"][Math.floor(rnd() * 4)] }));
  }, []);
  return items.map((r) => (
    <group key={r.x} position={[r.x, 0, SITE_D + 16]}>
      <mesh position={[0, r.h / 2, 3]} castShadow>
        <boxGeometry args={[9, r.h, 10]} />
        <meshStandardMaterial color={r.c} map={map} />
      </mesh>
      <mesh position={[0, 3.2, -2.3]} rotation-x={0.35}>
        <boxGeometry args={[8.8, 0.1, 1.8]} />
        <meshStandardMaterial color={r.a} />
      </mesh>
    </group>
  ));
}

const CLOUDS = 14;

// Low-poly cumulus drifting slowly across the sky; each cloud is a few flattened puffs.
function Clouds() {
  const ref = useRef<Group>(null);
  const puffs = useMemo(() => {
    const rnd = random(MAP.id.length * 7);
    return Array.from({ length: CLOUDS }, () => {
      const x = CX + (rnd() - 0.5) * 900;
      const z = CZ + (rnd() - 0.5) * 900;
      const y = 120 + rnd() * 70;
      return Array.from({ length: 4 }, (_, k) => [x + (k - 1.5) * 16 + rnd() * 8, y + rnd() * 6, z + rnd() * 14, 14 + rnd() * 10] as const);
    }).flat();
  }, []);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.x = ((g.position.x + dt * 1.5 + 450) % 900) - 450;
  });
  return (
    <group ref={ref}>
      {puffs.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} scale={[r * 1.6, r * 0.6, r]}>
          <icosahedronGeometry args={[1, 1]} />
          {/* Lit from within a little, so a low sun doesn't leave the undersides grey. */}
          <meshStandardMaterial color="#ffffff" emissive="#f4ece4" emissiveIntensity={0.55} flatShading transparent opacity={0.9} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// A belt of trees outside the fence, thickening with distance, kept off the road and the beach.
function TreeBelt({ share }: { share: number }) {
  const sets = useMemo(() => {
    const kinds = MAP.id === "pegunungan" ? [M.pines[4], M.pines[2], M.trees[4]] : MAP.id === "kota" ? [M.trees[4]] : [M.trees[4], M.palms[0], M.palms[3]];
    const count = MAP.id === "kota" ? 70 : 520;
    const out = kinds.map(() => [] as Placement[]);
    for (let i = 0; i < count; i++) {
      const a = rand(i) * Math.PI * 2;
      // The distance grows with this draw, so a lighter tier keeping the low draws keeps the nearer trees.
      if (rand(i + 500) > share) continue;
      const r = 80 + Math.sqrt(rand(i + 500)) * 220;
      const x = CX + Math.cos(a) * r * 1.2;
      const z = CZ + Math.sin(a) * r;
      if (z > SITE_D - 6 && z < SITE_D + 34) continue;
      if (MAP.id === "pesisir" && z > SITE_D) continue;
      if (x > -14 && x < SITE_W + 14 && z > -14 && z < SITE_D + 14) continue;
      const k = i % kinds.length;
      const h = (kinds[k].includes("pine") ? 11 : kinds[k].includes("palm") ? 10 : 8) * (0.8 + rand(i + 900) * 0.5);
      out[k].push({ x, y: 0, z, ry: rand(i + 77) * Math.PI * 2, size: [0, h, 0] });
    }
    return kinds.map((src, k) => ({ src, items: out[k] }));
  }, [share]);
  return sets.map((s) => <Instances key={s.src} src={s.src} items={s.items} shadows={false} />);
}

// Tufts on open lawn and the hill, and flowers in the beds along the building fronts.
function Undergrowth() {
  const { grass, flowers } = useMemo(() => {
    const grass: Placement[][] = [[], []];
    const flowers: Placement[][] = M.flowers.map(() => []);
    findTiles(".h").forEach(([tx, tz], n) => {
      if (surfaceAt(tx, tz)) return;
      for (let k = 0; k < 2; k++) {
        const i = n * 2 + k;
        const x = (tx + 0.1 + rand(i) * 0.8) * TILE;
        const z = (tz + 0.1 + rand(i + 3000) * 0.8) * TILE;
        const big = rand(i + 7000) < 0.2;
        grass[big ? 1 : 0].push({ x, y: elevationAt(x, z), z, ry: rand(i + 900) * 6, size: [0, big ? 0.7 : 0.35 + rand(i + 50) * 0.2, 0] });
      }
      const nextToBuilding = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => "123456".includes(tileAt(tx + dx, tz + dz)));
      if (nextToBuilding && !isBlocked(tx, tz) && rand(n + 11) < 0.7) {
        const x = (tx + 0.5) * TILE + (rand(n) - 0.5);
        const z = (tz + 0.5) * TILE + (rand(n + 1) - 0.5);
        flowers[n % flowers.length].push({ x, y: elevationAt(x, z), z, ry: rand(n + 2) * 6, size: [0, 0.45, 0] });
      }
    });
    return { grass, flowers };
  }, []);
  return (
    <>
      {M.grass.map((src, k) => (
        <Instances key={src} src={src} items={grass[k]} shadows={false} />
      ))}
      {M.flowers.map((src, k) => (
        <Instances key={src} src={src} items={flowers[k]} shadows={false} />
      ))}
    </>
  );
}

export default function Horizon() {
  const look = LOOK[MAP.id];
  const tier = TIER[useDrill((s) => s.quality)];
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[CX, 0.03, (SITE_D - 480) / 2]} receiveShadow>
        <planeGeometry args={[1400, 480 + SITE_D]} />
        <meshStandardMaterial color={look.ground} />
      </mesh>
      <Clouds />
      {MAP.id === "pesisir" && (
        <>
          <Ridge radius={380} height={70} a0={Math.PI * 1.05} a1={Math.PI * 1.95} color="#5f7a52" seed={3} />
          <Ridge radius={560} height={130} a0={Math.PI * 1.1} a1={Math.PI * 1.9} color="#6d8291" seed={4} />
          <Volcano x={CX - 140} z={-640} radius={420} height={300} color="#5d6e5a" />
          <Islands />
        </>
      )}
      {MAP.id === "pegunungan" && (
        <>
          <Ridge radius={300} height={90} a0={-Math.PI * 0.35} a1={Math.PI * 0.35} color="#4d7044" seed={7} />
          <Ridge radius={300} height={90} a0={Math.PI * 0.65} a1={Math.PI * 1.35} color="#4d7044" seed={8} />
          <Ridge radius={420} height={150} a0={Math.PI * 1.0} a1={Math.PI * 2.0} color="#567259" seed={9} />
          <Ridge radius={620} height={230} a0={0} a1={Math.PI * 2} color="#6b8090" seed={10} />
          <Volcano x={CX + 60} z={-760} radius={560} height={480} color="#4f6650" />
          <Valley />
        </>
      )}
      {MAP.id === "kota" && (
        <>
          <Ridge radius={700} height={120} a0={Math.PI * 1.15} a1={Math.PI * 1.85} color="#8995a0" seed={12} />
          <Skyline />
          <Ruko />
        </>
      )}
      <Suspense fallback={null}>
        <TreeBelt share={tier.trees} />
        {tier.grass && <Undergrowth />}
      </Suspense>
    </>
  );
}

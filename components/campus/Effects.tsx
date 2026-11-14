"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useRef } from "react";
import { Color, Object3D, type Group, type InstancedMesh, type Mesh } from "three";
import Character, { type Anim, type Look } from "@/components/Character";
import Model, { M } from "@/components/Model";
import { ASSEMBLY, GRID, TILE, W, elevationAt, tileCenter, tileElevation, type Tile } from "@/lib/campus";
import { QUAKE_SHAKE_S, bestRoute, waterLevel } from "@/lib/sim";
import { getState, run } from "./drillStore";

const drillTime = () => {
  const s = getState();
  return s.phase === "idle" ? -Infinity : (Date.now() - s.startAt) / 1000;
};

const wading = (x: number, z: number) => {
  const s = getState();
  const level = s.phase === "idle" ? 0 : waterLevel(s.scenario, s.phase === "running" ? drillTime() : Infinity);
  return level - elevationAt(x, z);
};

const CLASSMATES: { home: Tile; look: Look }[] = [
  { home: [3, 7], look: "female-c" },
  { home: [5, 9], look: "male-a" },
  { home: [2, 9], look: "female-e" },
  { home: [11, 9], look: "female-b" },
  { home: [12, 7], look: "male-f" },
  { home: [17, 8], look: "female-f" },
  { home: [21, 7], look: "male-a" },
  { home: [24, 8], look: "female-c" },
  { home: [5, 14], look: "male-f" },
  { home: [10, 15], look: "female-b" },
];

type Plan = { pts: [number, number][]; cum: number[]; d: number };

function plan(home: Tile): Plan {
  const tiles = bestRoute(GRID, home, run.goals, run.hazards) ?? [home];
  const pts = tiles.map(([x, z]) => tileCenter(x, z));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, d: 0 };
}

// Drills teach walking briskly, not running: classmates model that, ducking first when the ground shakes.
function Classmate({ i }: { i: number }) {
  const c = CLASSMATES[i];
  const ref = useRef<Group>(null);
  const [hx, hz] = tileCenter(...c.home);
  const me = useRef({ x: hx, z: hz, heading: Math.PI, drill: -1, plan: null as Plan | null, anim: "idle" as Anim });
  const speed = 1.4 + ((i * 37) % 10) / 20;
  const delay = 0.3 + ((i * 53) % 10) / 9;

  useFrame((_, dt) => {
    const g = ref.current;
    const s = getState();
    const st = me.current;
    if (!g) return;
    if (s.phase === "idle" || st.drill !== s.startAt) {
      Object.assign(st, { x: hx, z: hz, heading: Math.PI, plan: null, anim: "idle" });
      st.drill = s.phase === "idle" ? -1 : s.startAt;
      if (s.phase !== "idle") st.plan = plan(c.home);
    }
    const t = drillTime();
    const quake = s.scenario.kind === "gempa";
    const shaking = quake && t >= 0 && t < QUAKE_SHAKE_S;
    const go = st.plan && t >= (quake ? QUAKE_SHAKE_S : 0) + delay;

    if (shaking) st.anim = "crouch";
    else if (go && st.plan) {
      const p = st.plan;
      const total = p.cum[p.cum.length - 1];
      const stop = Math.max(0, total - 1.5 - (i % 4) * 1.2);
      const depth = wading(st.x, st.z);
      if (p.d < stop) {
        p.d = Math.min(stop, p.d + speed * dt * (depth > 1 ? 0.25 : depth > 0.3 ? 0.6 : 1));
        let k = 1;
        while (k < p.cum.length - 1 && p.cum[k] < p.d) k++;
        const f = Math.min(1, Math.max(0, (p.d - p.cum[k - 1]) / (p.cum[k] - p.cum[k - 1] || 1)));
        const [ax, az] = p.pts[k - 1];
        const [bx, bz] = p.pts[k] ?? p.pts[k - 1];
        const side = ((i % 3) - 1) * 0.9;
        const len = Math.hypot(bx - ax, bz - az) || 1;
        st.x = ax + (bx - ax) * f - ((bz - az) / len) * side;
        st.z = az + (bz - az) * f + ((bx - ax) / len) * side;
        st.heading = Math.atan2(bx - ax, bz - az);
        st.anim = "walk";
      } else st.anim = "idle";
    } else st.anim = "idle";

    g.position.set(st.x, elevationAt(st.x, st.z), st.z);
    g.rotation.y = st.heading;
  });

  return (
    <group ref={ref}>
      <Character look={c.look} height={1.45 + (i % 3) * 0.08} speed={1.1} anim={() => me.current.anim} />
    </group>
  );
}

export function Classmates() {
  return (
    <Suspense fallback={null}>
      {CLASSMATES.map((_, i) => (
        <Classmate key={i} i={i} />
      ))}
    </Suspense>
  );
}

const MAX_DEBRIS = 90;
const ROOF = new Color("#b4532a");
const CONCRETE = new Color("#b9b1a0");

export function QuakeDebris() {
  const ref = useRef<InstancedMesh>(null);
  const chunks = useRef<{ x: number; z: number; y0: number; at: number; spin: number }[]>([]);
  const drill = useRef(-1);
  const o = useRef(new Object3D());

  useLayoutEffect(() => {
    const mesh = ref.current!;
    for (let i = 0; i < MAX_DEBRIS; i++) mesh.setColorAt(i, i % 3 ? ROOF : CONCRETE);
    mesh.count = 0;
  }, []);

  useFrame(() => {
    const mesh = ref.current;
    const s = getState();
    if (!mesh) return;
    if (s.phase === "idle" || s.scenario.kind !== "gempa") {
      mesh.count = 0;
      drill.current = -1;
      return;
    }
    if (drill.current !== s.startAt) {
      drill.current = s.startAt;
      const tiles = [...run.hazards];
      const pick = tiles.filter((_, k) => (k * 7919) % 3 === 0).slice(0, MAX_DEBRIS);
      chunks.current = pick.map((k, n) => {
        const x = ((k % W) + 0.2 + ((n * 37) % 10) / 16) * TILE;
        const z = (Math.floor(k / W) + 0.2 + ((n * 53) % 10) / 16) * TILE;
        return { x, z, y0: 4 + ((n * 17) % 10) / 2.5, at: 0.4 + ((n * 29) % 100) / 100 * (QUAKE_SHAKE_S - 1.4), spin: (n % 7) - 3 };
      });
    }
    const t = drillTime();
    const tmp = o.current;
    chunks.current.forEach((c, n) => {
      const ground = elevationAt(c.x, c.z) + 0.08;
      const p = t < c.at ? -1 : Math.min(1, (t - c.at) / 0.55);
      tmp.position.set(c.x, p < 0 ? -10 : c.y0 - (c.y0 - ground) * p * p, c.z);
      tmp.rotation.set(c.spin * p, c.spin * 0.7 * p, 0.3 * c.spin);
      tmp.scale.setScalar(p < 0 ? 0.001 : 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(n, tmp.matrix);
    });
    mesh.count = chunks.current.length;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_DEBRIS]} castShadow frustumCulled={false}>
      <boxGeometry args={[0.5, 0.15, 0.35]} />
      <meshStandardMaterial color="#ffffff" />
    </instancedMesh>
  );
}

const FLOATERS: { src: string; x: number; z: number; h: number }[] = [
  { src: M.crate, x: 28.5, z: 25.8, h: 0.6 },
  { src: M.barrel, x: 45.6, z: 35.4, h: 0.9 },
  { src: M.crate, x: 67.2, z: 27.9, h: 0.55 },
  { src: M.crate, x: 40.8, z: 74.4, h: 0.65 },
  { src: M.barrel, x: 79.5, z: 72.9, h: 0.9 },
  { src: M.crate, x: 18.6, z: 70.2, h: 0.6 },
];

function Floater({ f, i }: { f: (typeof FLOATERS)[number]; i: number }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    const s = getState();
    if (!g) return;
    const depth = s.scenario.kind === "banjir" ? wading(f.x, f.z) : -1;
    g.visible = depth > 0.15;
    if (!g.visible) return;
    const now = Date.now() / 1000;
    g.position.set(f.x + Math.sin(now * 0.4 + i) * 0.9, elevationAt(f.x, f.z) + depth - 0.15 + Math.sin(now * 2 + i) * 0.05, f.z);
    g.rotation.set(Math.sin(now * 1.3 + i) * 0.12, now * 0.2 + i, Math.cos(now * 1.1 + i) * 0.1);
  });
  return (
    <group ref={ref} visible={false}>
      <Model src={f.src} fit={{ height: f.h }} />
    </group>
  );
}

export function FloodDebris() {
  return (
    <Suspense fallback={null}>
      {FLOATERS.map((f, i) => (
        <Floater key={i} f={f} i={i} />
      ))}
    </Suspense>
  );
}

export function Beacons() {
  const refs = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    const s = getState();
    const pulse = 0.25 + Math.abs(Math.sin(Date.now() / 450)) * 0.2;
    ASSEMBLY.forEach(([x, z], k) => {
      const m = refs.current[k];
      if (!m) return;
      m.visible = s.phase === "running" && run.goals.some(([gx, gz]) => gx === x && gz === z);
      (m.material as { opacity: number }).opacity = pulse;
    });
  });
  return ASSEMBLY.map(([x, z], k) => {
    const [cx, cz] = tileCenter(x, z);
    return (
      <mesh
        key={`${x}-${z}`}
        ref={(m) => {
          refs.current[k] = m;
        }}
        position={[cx, tileElevation(x, z) + 6, cz]}
        visible={false}
      >
        <cylinderGeometry args={[3.9, 4.4, 12, 32, 1, true]} />
        <meshBasicMaterial color="#34c47c" transparent opacity={0.3} depthWrite={false} side={2} />
      </mesh>
    );
  });
}


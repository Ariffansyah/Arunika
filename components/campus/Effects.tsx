"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useRef } from "react";
import { Color, Object3D, type Group, type InstancedMesh, type Mesh } from "three";
import Character, { type Anim, type Look } from "@/components/Character";
import Model, { M } from "@/components/Model";
import { ASSEMBLY, TILE, W, elevationAt, tileCenter, tileElevation } from "@/lib/campus";
import { PLAN, STOREY, classrooms } from "@/lib/floorplan";
import { distanceAt, free, groundY, layerAt, nextStep } from "@/lib/nav";
import { random, waterLevel } from "@/lib/sim";
import { CLASSMATE_SEATS, aftershockAt, drillTime, getState, roomSeats, run, shakingAt } from "./drillStore";
import { closedDoors, openDoorsNear } from "./interact";

const wading = (x: number, z: number, layer = 0) => {
  const s = getState();
  const level = s.phase === "idle" ? 0 : waterLevel(s.scenario, s.phase === "running" ? drillTime() : Infinity);
  return level - groundY(x, z, layer);
};

const LOOKS: Look[] = ["female-c", "male-a", "female-e", "female-b", "male-f", "female-f", "male-a", "female-c", "male-f", "female-b", "female-e", "male-a"];
// Where the class sits between drills.
const HOME_ROOM = classrooms()[0].id;
const mates = LOOKS.map(() => ({ x: 0, z: 0 }));

// Drills teach walking briskly, not running: classmates model that, ducking first when the ground shakes.
function Classmate({ i }: { i: number }) {
  const ref = useRef<Group>(null);
  const me = useRef({ x: 0, z: 0, layer: 0, heading: 0, key: "", anim: "sit" as Anim });
  const speed = 1.3 + ((i * 37) % 10) / 25;
  const delay = 0.3 + ((i * 53) % 10) / 6;

  useFrame((_, dt) => {
    const g = ref.current;
    const s = getState();
    const st = me.current;
    if (!g) return;
    const room = s.phase === "idle" ? HOME_ROOM : s.room;
    const key = `${room}:${s.phase === "idle" ? "idle" : s.startAt}`;
    if (st.key !== key) {
      const seat = roomSeats(room)[CLASSMATE_SEATS[i]];
      const layer = PLAN.rooms.find((r) => r.id === room)!.floor;
      Object.assign(st, { x: seat.x, z: seat.z, layer, heading: seat.ry, key, anim: "sit" });
    }
    const t = drillTime();
    const quake = s.scenario.kind === "gempa";
    const shaking = quake && shakingAt(t);
    const field = s.phase !== "idle" ? run.field : null;

    if (!field || t < 0) st.anim = "sit";
    else if (shaking || (quake && aftershockAt(t))) st.anim = "crouch";
    else if (t < (run.timeline.shake?.[1] ?? 0) + delay) st.anim = quake ? "idle" : "sit";
    else {
      const next = distanceAt(field, st.x, st.z, st.layer) > 0 ? nextStep(field, st.x, st.z, st.layer) : null;
      if (next) {
        const tx = next.x - st.x;
        const tz = next.z - st.z;
        const len = Math.hypot(tx, tz) || 1;
        // Keep a little apart so the class files out instead of merging into one body.
        let sx = 0;
        let sz = 0;
        mates.forEach((o, j) => {
          const ox = st.x - o.x;
          const oz = st.z - o.z;
          const d2 = ox * ox + oz * oz;
          if (j !== i && d2 > 1e-4 && d2 < 0.36) {
            sx += ox / d2;
            sz += oz / d2;
          }
        });
        const mx = tx / len + sx * 0.08;
        const mz = tz / len + sz * 0.08;
        const ml = Math.hypot(mx, mz) || 1;
        const depth = wading(st.x, st.z, st.layer);
        const step = Math.min(len, speed * dt * (depth > 1 ? 0.25 : depth > 0.3 ? 0.6 : 1));
        const nx = st.x + (mx / ml) * step;
        const nz = st.z + (mz / ml) * step;
        openDoorsNear(st.x, st.z, groundY(st.x, st.z, st.layer));
        // The field only routes through open cells, so when the nudge apart hits furniture the plain step is safe.
        const ok = free(nx, nz, layerAt(nx, nz, st.layer), 0.18, closedDoors);
        st.x = ok ? nx : st.x + (tx / len) * step;
        st.z = ok ? nz : st.z + (tz / len) * step;
        st.layer = layerAt(st.x, st.z, st.layer);
        st.heading = Math.atan2(mx, mz);
        st.anim = "walk";
      } else st.anim = "idle";
    }
    mates[i].x = st.x;
    mates[i].z = st.z;
    // Ducking at their seat puts them under the desk in front of them.
    const under = shaking ? 0.35 : 0;
    g.position.set(st.x + Math.sin(st.heading) * under, groundY(st.x, st.z, st.layer), st.z + Math.cos(st.heading) * under);
    g.rotation.y = st.heading;
  });

  return (
    <group ref={ref}>
      <Character look={LOOKS[i]} height={1.45 + (i % 3) * 0.08} speed={1.1} anim={() => me.current.anim} />
    </group>
  );
}

export function Classmates() {
  return (
    <Suspense fallback={null}>
      {LOOKS.map((_, i) => (
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
        const end = run.timeline.shake?.[1] ?? 8;
        return { x, z, y0: 4 + ((n * 17) % 10) / 2.5, at: 0.4 + (((n * 29) % 100) / 100) * (end - 1.4), spin: (n % 7) - 3 };
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


const SHARDS_PER_PANE = 6;
const GLASS = new Color("#cfe6f2");

// Broken windows leave glass on the floor on both sides, the reason to stay away from them while it shakes.
export function GlassShards() {
  const ref = useRef<InstancedMesh>(null);
  const drill = useRef(-1);
  const shown = useRef(-1);
  const spots = useRef<{ x: number; y: number; z: number; ry: number; at: number }[]>([]);
  const o = useRef(new Object3D());

  useFrame(() => {
    const mesh = ref.current;
    const s = getState();
    if (!mesh) return;
    if (drill.current !== s.startAt) {
      drill.current = s.startAt;
      shown.current = -1;
      const rnd = random(run.seed + 17);
      spots.current = [...run.breaks].flatMap(([i, at]) => {
        const p = PLAN.panes[i];
        const floor = PLAN.floorY[p.b] + p.floor * STOREY;
        return Array.from({ length: SHARDS_PER_PANE }, () => {
          const along = (rnd() - 0.5) * p.w;
          const off = (rnd() < 0.5 ? -1 : 1) * (0.15 + rnd() * 0.8);
          const [x, z] = p.along === "x" ? [p.x + along, p.z + off] : [p.x + off, p.z + along];
          return { x, y: floor + 0.02, z, ry: rnd() * Math.PI, at };
        });
      });
    }
    const t = s.phase === "idle" ? -1 : drillTime();
    const count = spots.current.filter((sp) => t >= sp.at).length;
    if (count === shown.current) return;
    shown.current = count;
    let n = 0;
    for (const sp of spots.current) {
      if (t < sp.at) continue;
      o.current.position.set(sp.x, sp.y, sp.z);
      o.current.rotation.set(0, sp.ry, 0);
      o.current.updateMatrix();
      mesh.setMatrixAt(n++, o.current.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, PLAN.panes.length * SHARDS_PER_PANE]} frustumCulled={false}>
      <boxGeometry args={[0.18, 0.015, 0.1]} />
      <meshStandardMaterial color={GLASS} transparent opacity={0.6} roughness={0.1} />
    </instancedMesh>
  );
}

// Rubble from the damaged wall buries one doorway of a weak building, so the class has to use another.
export function DoorRubble() {
  const ref = useRef<InstancedMesh>(null);
  const drill = useRef(-1);
  const o = useRef(new Object3D());
  useLayoutEffect(() => {
    const mesh = ref.current!;
    for (let i = 0; i < 24; i++) mesh.setColorAt(i, i % 3 ? CONCRETE : ROOF);
    mesh.count = 0;
  }, []);
  useFrame(() => {
    const mesh = ref.current;
    const s = getState();
    if (!mesh) return;
    const end = run.timeline.shake?.[1] ?? 0;
    const show = s.phase !== "idle" && run.blocked.length > 0 && drillTime() >= end * 0.7;
    if (!show) {
      mesh.count = 0;
      drill.current = -1;
      return;
    }
    if (drill.current === s.startAt) return;
    drill.current = s.startAt;
    const rnd = random(run.seed + 29);
    let n = 0;
    for (const id of run.blocked) {
      const d = PLAN.doors.find((door) => door.id === id)!;
      for (let k = 0; k < 12; k++) {
        const along = (rnd() - 0.5) * (d.w + 0.6);
        const off = (rnd() - 0.5) * 1.4;
        const [x, z] = d.along === "x" ? [d.x + along, d.z + off] : [d.x + off, d.z + along];
        const size = 0.35 + rnd() * 0.45;
        o.current.position.set(x, d.y + size * 0.35 + rnd() * 0.5, z);
        o.current.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        o.current.scale.set(size, size * 0.6, size * 0.8);
        o.current.updateMatrix();
        mesh.setMatrixAt(n++, o.current.matrix);
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 24]} castShadow frustumCulled={false}>
      <boxGeometry />
      <meshStandardMaterial color="#ffffff" />
    </instancedMesh>
  );
}

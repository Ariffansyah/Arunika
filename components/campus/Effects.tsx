"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, Color, DoubleSide, Object3D, PlaneGeometry, Vector3, type Group, type InstancedMesh, type Mesh } from "three";
import Character, { type Anim, type Look } from "@/components/Character";
import Model, { M } from "@/components/Model";
import { ASSEMBLY, MAP, TILE, W, elevationAt, findTiles, surfaceAt, tileCenter, tileElevation } from "@/lib/campus";
import { PLAN, STOREY, classrooms } from "@/lib/floorplan";
import { distanceAt, free, groundY, layerAt, nextStep } from "@/lib/nav";
import { SLIDE_S, WALK_SPEED, random, vortexAt, waterLevel, within } from "@/lib/sim";
import { CLASSMATE_SEATS, aftershockAt, drillTime, getState, landslideSigns, roomSeats, run, shakingAt, useDrill } from "./drillStore";
import { closedDoors, openDoorsNear } from "./interact";

const wading = (x: number, z: number, layer = 0) => {
  const s = getState();
  const level = s.phase === "idle" ? 0 : waterLevel(s.scenario, s.phase === "running" ? drillTime() : Infinity, run.timeline.rise);
  return level - groundY(x, z, layer);
};

const LOOKS: Look[] = ["siswi-a", "siswa-a", "siswi-d", "siswi-b", "siswa-b", "siswi-c", "siswa-c", "siswi-a", "siswa-b", "siswi-b", "siswi-d", "siswa-a"];
// Where the class sits between drills.
const HOME_ROOM = classrooms()[0].id;
const mates = LOOKS.map(() => ({ x: 0, z: 0 }));

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// Once at an assembly point, each classmate walks to a place of their own in a loose ring round its centre,
// so the class stands together instead of piling up on the edge and jostling.
function arrivalSpot(x: number, z: number, layer: number, i: number): { at: [number, number]; centre: [number, number] | null } {
  const centre = layer === 0 ? ASSEMBLY.map((a) => tileCenter(...a)).find(([cx, cz]) => Math.hypot(cx - x, cz - z) < 6) : undefined;
  if (!centre) return { at: [x, z], centre: null };
  const a = i * 2.4;
  const r = 1.4 + (i % 3) * 0.9;
  const at: [number, number] = [centre[0] + Math.cos(a) * r, centre[1] + Math.sin(a) * r];
  return { at: free(...at, 0, 0.3) ? at : [x, z], centre };
}

// Drills teach walking briskly, not running: classmates model that, ducking first when the ground shakes.
function Classmate({ i, count }: { i: number; count: number }) {
  const ref = useRef<Group>(null);
  const me = useRef({
    x: 0,
    z: 0,
    layer: 0,
    heading: 0,
    face: 0,
    key: "",
    anim: "sit" as Anim,
    rate: 1,
    under: 0,
    spot: null as { at: [number, number]; centre: [number, number] | null } | null,
  });
  const speed = 1.3 + ((i * 37) % 10) / 25;
  const height = 1.45 + (i % 3) * 0.08;
  const delay = 0.3 + ((i * 53) % 10) / 6;

  useFrame((_, dt) => {
    const g = ref.current;
    const s = getState();
    const st = me.current;
    if (!g) return;
    const key = s.phase === "idle" ? "idle" : String(s.startAt);
    if (st.key !== key) {
      // Between drills the class sits in the first classroom; a drill puts them wherever it starts.
      const seat = roomSeats(HOME_ROOM)[CLASSMATE_SEATS[i]];
      const [x, z, ry, layer] = s.phase === "idle" ? [seat.x, seat.z, seat.ry, PLAN.rooms.find((r) => r.id === HOME_ROOM)!.floor] : (run.mates[i] ?? run.mates[0]);
      Object.assign(st, { x, z, layer, heading: ry, face: ry, key, anim: "sit", spot: null });
    }
    const seated = s.phase === "idle" || run.situation?.place === "kelas";
    const t = drillTime();
    const quake = s.scenario.kind === "gempa";
    const shaking = quake && shakingAt(t);
    const field = s.phase !== "idle" ? run.field : null;

    if (!field || t < 0) st.anim = seated ? "sit" : "idle";
    // At a desk they duck under it; anywhere else they drop where they stand.
    else if (shaking) st.anim = seated ? "cover" : "crouch";
    else if (quake && aftershockAt(t)) st.anim = "crouch";
    else if (t < (run.timeline.shake?.[1] ?? 0) + delay) st.anim = quake || !seated ? "idle" : "sit";
    else {
      let to: { x: number; z: number } | null = null;
      if (st.spot) {
        if (Math.hypot(st.spot.at[0] - st.x, st.spot.at[1] - st.z) > 0.15) to = { x: st.spot.at[0], z: st.spot.at[1] };
      } else if (distanceAt(field, st.x, st.z, st.layer) > 0) to = nextStep(field, st.x, st.z, st.layer);
      else st.spot = arrivalSpot(st.x, st.z, st.layer, i);
      if (to) {
        const tx = to.x - st.x;
        const tz = to.z - st.z;
        const len = Math.hypot(tx, tz) || 1;
        // On the way, keep a little apart so the class files out instead of merging into one body.
        let sx = 0;
        let sz = 0;
        if (!st.spot) {
          mates.slice(0, count).forEach((o, j) => {
            const ox = st.x - o.x;
            const oz = st.z - o.z;
            const d2 = ox * ox + oz * oz;
            if (j !== i && d2 > 1e-4 && d2 < 0.36) {
              sx += ox / d2;
              sz += oz / d2;
            }
          });
        }
        const mx = tx / len + sx * 0.08;
        const mz = tz / len + sz * 0.08;
        const ml = Math.hypot(mx, mz) || 1;
        const depth = wading(st.x, st.z, st.layer);
        const water = depth > 1 ? 0.25 : depth > 0.3 ? 0.6 : 1;
        const step = Math.min(len, speed * dt * water);
        const nx = st.x + (mx / ml) * step;
        const nz = st.z + (mz / ml) * step;
        openDoorsNear(st.x, st.z, groundY(st.x, st.z, st.layer));
        // The field only routes through open cells, so when the nudge apart hits furniture the plain step is safe.
        const ok = free(nx, nz, layerAt(nx, nz, st.layer), 0.18, closedDoors);
        if (ok || !st.spot) {
          st.x = ok ? nx : st.x + (tx / len) * step;
          st.z = ok ? nz : st.z + (tz / len) * step;
        } else st.spot.at = [st.x, st.z];
        st.layer = layerAt(st.x, st.z, st.layer);
        // Facing follows the way ahead, not the nudges, so bodies don't twitch.
        st.face = Math.atan2(tx, tz);
        st.anim = "walk";
        st.rate = ((speed * water) / WALK_SPEED) * (1.6 / height);
      } else {
        st.anim = within(run.timeline.wind, t) ? "crouch" : "idle";
        const c = st.spot?.centre;
        if (c) st.face = Math.atan2(c[0] - st.x, c[1] - st.z);
      }
    }
    mates[i].x = st.x;
    mates[i].z = st.z;
    st.heading += wrap(st.face - st.heading) * (1 - Math.exp(-dt * 8));
    // Ducking at their seat slides them under the desk in front of them.
    st.under += ((st.anim === "cover" ? 0.45 : 0) - st.under) * (1 - Math.exp(-dt * 10));
    g.position.set(st.x + Math.sin(st.heading) * st.under, groundY(st.x, st.z, st.layer), st.z + Math.cos(st.heading) * st.under);
    g.rotation.y = st.heading;
  });

  return (
    <group ref={ref}>
      <Character look={LOOKS[i]} height={height} anim={() => (me.current.anim === "walk" ? ["walk", me.current.rate] : me.current.anim)} />
    </group>
  );
}

export function Classmates() {
  const count = useDrill((s) => s.npc);
  return (
    <Suspense fallback={null}>
      {LOOKS.slice(0, count).map((_, i) => (
        <Classmate key={i} i={i} count={count} />
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

// Crates and barrels left about the lowest open ground, where a flood lifts them first.
const FLOATERS = findTiles(".")
  .filter(([x, z]) => !surfaceAt(x, z))
  .sort((a, b) => tileElevation(...a) - tileElevation(...b))
  .filter((_, k) => k % 17 === 5)
  .slice(0, 6)
  .map(([x, z], i) => {
    const [cx, cz] = tileCenter(x, z);
    return { src: i % 3 === 1 ? M.barrel : M.crate, x: cx, z: cz, h: i % 3 === 1 ? 0.9 : 0.55 + (i % 2) * 0.1 };
  });

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

const DROPS = 1400;

// Rain falls in a box that travels with the camera, so a few hundred streaks read as a downpour anywhere.
export function Rain() {
  const ref = useRef<InstancedMesh>(null);
  const camera = useThree((s) => s.camera);
  const drops = useMemo(() => {
    const rnd = random(11);
    return Array.from({ length: DROPS }, () => [rnd() * 60 - 30, rnd() * 30, rnd() * 60 - 30, 9 + rnd() * 4]);
  }, []);
  const o = useMemo(() => new Object3D(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const s = getState();
    const kind = s.scenario.kind;
    const on = s.phase !== "idle" && (kind === "longsor" || kind === "angin");
    mesh.visible = on;
    if (!on) return;
    const now = Date.now() / 1000;
    const count = kind === "longsor" ? DROPS : DROPS / 2;
    const lean = kind === "angin" ? 0.45 : 0.08;
    const c = camera.position;
    for (let i = 0; i < count; i++) {
      const [dx, dy, dz, v] = drops[i];
      const y = 30 - ((dy + now * v) % 30);
      o.position.set(c.x + dx + y * lean, c.y - 12 + y, c.z + dz);
      o.rotation.set(0, 0, lean);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, DROPS]} frustumCulled={false} visible={false}>
      <boxGeometry args={[0.02, 0.7, 0.02]} />
      <meshBasicMaterial color="#c7d3dc" transparent opacity={0.5} />
    </instancedMesh>
  );
}

const FUNNEL = [
  [3, 5],
  [5, 8],
  [8, 12],
  [12, 16],
  [16, 21],
  [21, 26],
];
const SWIRL = 90;

// The whirlwind: a widening funnel of dust carrying roof sheets and branches round and up as it crosses.
export function Vortex() {
  const ref = useRef<Group>(null);
  const debris = useRef<InstancedMesh>(null);
  const o = useMemo(() => new Object3D(), []);
  useFrame(() => {
    const g = ref.current;
    const mesh = debris.current;
    const s = getState();
    if (!g || !mesh) return;
    const v = s.phase !== "idle" && s.scenario.kind === "angin" ? vortexAt(run.timeline, drillTime()) : null;
    g.visible = !!v;
    if (!v) return;
    const now = Date.now() / 1000;
    g.position.set(v[0], elevationAt(v[0], v[1]), v[1]);
    g.children.forEach((c, i) => {
      if (c !== mesh) c.rotation.y = now * (1.6 + i * 0.35);
    });
    for (let k = 0; k < SWIRL; k++) {
      const h = (k * 7.3) % 50;
      const a = now * (2.2 - h * 0.025) + k * 2.4;
      const r = 3 + h * 0.4 + (k % 4);
      o.position.set(Math.cos(a) * r, h + Math.sin(now * 3 + k) * 0.8, Math.sin(a) * r);
      o.rotation.set(now * 3 + k, now * 2 + k, k);
      o.updateMatrix();
      mesh.setMatrixAt(k, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <group ref={ref} visible={false}>
      {FUNNEL.map(([bottom, top], i) => (
        <mesh key={i} position={[0, 5 + i * 10, 0]}>
          <cylinderGeometry args={[top, bottom, 10, 24, 1, true]} />
          <meshStandardMaterial color={i % 2 ? "#6b7178" : "#7d838a"} transparent opacity={0.34 - i * 0.03} side={DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <instancedMesh ref={debris} args={[undefined, undefined, SWIRL]} frustumCulled={false}>
        <boxGeometry args={[0.7, 0.05, 0.45]} />
        <meshStandardMaterial color="#59626b" />
      </instancedMesh>
    </group>
  );
}

const ROCKS = 40;
const LOGS = 6;
const FRONT_PUFFS = 14;
const UP = new Vector3(0, 1, 0);
const normal = new Vector3();
const MUD_WET = new Color("#3e2918");
const MUD_DRY = new Color("#74502f");

// Every lane a slope could slide down, so one plane can take the shape of whichever gives way.
const BOUNDS = MAP.runouts.reduce(
  ([x0, x1, z0, z1], { ax, az, bx, bz, r }) => [Math.min(x0, ax - r, bx - r), Math.max(x1, ax + r, bx + r), Math.min(z0, az - r, bz - r), Math.max(z1, az + r, bz + r)],
  [Infinity, -Infinity, Infinity, -Infinity],
);

// How far down its lane the front of the earth has run, as a share of the lane, `p` of the way through the slide.
const frontAt = (p: number) => p * 1.15;

// Depth of earth at a point of the lane (`along` it from 0 at the top, `across` it from 0 in the middle to 1 at
// the edge). While it runs it is an even flow behind a bulging front; as it settles it drains from the torn
// scar near the top and piles up thick at the toe.
function earthDepth(along: number, across: number, x: number, z: number, p: number) {
  const front = frontAt(p);
  if (across >= 1 || along < -0.12 || along > Math.min(front, 1.08)) return 0;
  const lumps = 0.8 + 0.2 * Math.sin(x * 1.7 + z * 0.6) * Math.sin(z * 1.3 - x * 0.5) + 0.12 * Math.sin(x * 4.1) * Math.sin(z * 3.7);
  const settled = 0.12 + 1.9 * Math.min(1, Math.max(0, (along - 0.3) / 0.5)) * Math.min(1, (1.08 - along) / 0.12);
  const flowing = 1.1 + 0.8 * Math.exp(-(((front - along) * 9) ** 2));
  return (flowing + (settled - flowing) * p * p) * (1 - across * across) * lumps * Math.min(1, (front - along) * 14 + 0.25);
}

// Turns a sign to lie on the slope under it instead of cutting into it.
function onSlope(g: Object3D, x: number, z: number) {
  normal.set(elevationAt(x - 0.5, z) - elevationAt(x + 0.5, z), 1, elevationAt(x, z - 0.5) - elevationAt(x, z + 0.5)).normalize();
  g.position.set(x, elevationAt(x, z), z);
  g.quaternion.setFromUnitVectors(UP, normal);
}

// Warning signs on the slope, then the slope giving way down the drill's lane.
export function Landslide() {
  const signs = useRef<(Group | null)[]>([]);
  const lean = useRef<Group>(null);
  const crack = useRef<InstancedMesh>(null);
  const stream = useRef<Group>(null);
  const mass = useRef<Mesh>(null);
  const rocks = useRef<InstancedMesh>(null);
  const logs = useRef<InstancedMesh>(null);
  const puffs = useRef<InstancedMesh>(null);
  const shaped = useRef("");
  const o = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => new Color(), []);
  const geometry = useMemo(() => {
    if (!MAP.runouts.length) return null;
    const [x0, x1, z0, z1] = BOUNDS;
    const geo = new PlaneGeometry(x1 - x0, z1 - z0, 96, 64);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    geo.setAttribute("color", new BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    return geo;
  }, []);
  // Where each rock and log ends up in the heap, and how big it is; the same every drill.
  const debris = useMemo(() => {
    const rnd = random(5);
    return Array.from({ length: ROCKS + LOGS }, () => ({ end: 0.4 + 0.65 * rnd(), side: (rnd() - 0.5) * 1.5, size: 0.35 + rnd() * 0.9, spin: rnd() * 6 }));
  }, []);

  useFrame(() => {
    const s = getState();
    const on = s.phase !== "idle" && s.scenario.kind === "longsor";
    const t = on ? drillTime() : -Infinity;
    const lane = MAP.runouts[run.lane];
    if (!lane) return;
    const { ax, az, bx, bz, r } = lane;
    const len = Math.hypot(bx - ax, bz - az);
    const [dx, dz] = [(bx - ax) / len, (bz - az) / len];
    const heading = Math.atan2(dx, dz);
    const { signs: shown, slide } = run.timeline;
    const marks = landslideSigns();
    // The crack is laid piece by piece in world space; the tree stands upright; the trickle lies on the slope.
    marks.forEach((sign, i) => {
      const g = signs.current[i];
      if (!g) return;
      g.visible = t >= shown[i];
      if (i === 2) onSlope(g, sign.x, sign.z);
      else if (i === 1) g.position.set(sign.x, elevationAt(sign.x, sign.z), sign.z);
      if (i > 0) g.children[0].rotation.y = heading;
    });
    // The crack opens across the slope and gapes wider until the slope lets go.
    const cm = crack.current;
    if (cm && marks[0] && t >= shown[0]) {
      const [sx, sz] = [marks[0].x, marks[0].z];
      const open = Math.min(1, (t - shown[0]) / Math.max(1, (slide ?? t) - shown[0]));
      for (let k = 0; k < 9; k++) {
        const u = (k - 4) * 0.9;
        const jag = (k % 2 ? 0.35 : -0.35) + (k % 3) * 0.1;
        const [x, z] = [sx - dz * u + dx * jag, sz + dx * u + dz * jag];
        o.position.set(x, elevationAt(x, z) + 0.02, z);
        o.rotation.set(0, heading + Math.PI / 2 + (k % 2 ? 0.5 : -0.5), 0);
        o.scale.set(0.08 + 0.4 * open, 0.05, 1.15);
        o.updateMatrix();
        cm.setMatrixAt(k, o.matrix);
      }
      cm.instanceMatrix.needsUpdate = true;
    }
    // The second sign is a tree leaning further downhill as the ground creeps; the third a muddy trickle that grows.
    if (lean.current) lean.current.rotation.x = Math.min(0.45, Math.max(0, t - shown[1]) * 0.014);
    if (stream.current) stream.current.scale.setScalar(Math.min(1, 0.4 + Math.max(0, t - shown[2]) * 0.03));

    const p = on && slide !== null ? Math.min(1, Math.max(0, (t - slide) / SLIDE_S)) : 0;
    const m = mass.current;
    const rk = rocks.current;
    const lg = logs.current;
    const pf = puffs.current;
    if (!m || !rk || !lg || !pf) return;
    m.visible = rk.visible = lg.visible = p > 0;
    // The dust thrown up at the front drifts on and thins out after the earth stops.
    const after = on && slide !== null ? t - slide - SLIDE_S : -1;
    pf.visible = p > 0 && after < 6;
    if (pf.visible) {
      const front = Math.min(1.05, frontAt(p));
      (pf.material as { opacity: number }).opacity = 0.45 * Math.min(1, 1 - after / 6);
      for (let k = 0; k < FRONT_PUFFS; k++) {
        const u = (k / (FRONT_PUFFS - 1) - 0.5) * 1.6 * r;
        const back = (k % 3) * 2.5;
        const [x, z] = [ax + dx * (front * len - back) - dz * u, az + dz * (front * len - back) + dx * u];
        o.position.set(x, elevationAt(x, z) + 1.5 + (k % 4) * 0.6 + Math.max(0, after) * 0.5, z);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(1.6 + (k % 3) * 0.6 + p * 1.5 + Math.max(0, after) * 0.6);
        o.updateMatrix();
        pf.setMatrixAt(k, o.matrix);
      }
      pf.instanceMatrix.needsUpdate = true;
    }
    const key = `${run.lane}:${p}`;
    if (p === 0 || shaped.current === key) return;
    shaped.current = key;
    const pos = m.geometry.attributes.position;
    const col = m.geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const along = ((x - ax) * dx + (z - az) * dz) / len;
      const across = Math.abs((x - ax) * -dz + (z - az) * dx) / r;
      const depth = earthDepth(along, across, x, z, p);
      pos.setY(i, elevationAt(x, z) + (depth > 0.04 ? depth : -1));
      // Wet and dark where it runs thick, drier and paler on the scar and the lumps.
      tint.copy(MUD_WET).lerp(MUD_DRY, Math.min(1, Math.max(0, 0.75 - depth * 0.35 + 0.25 * Math.sin(x * 2.3 + z * 1.9))));
      col.setXYZ(i, tint.r, tint.g, tint.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    m.geometry.computeVertexNormals();
    // Rocks and uprooted trunks ride the front, tumbling, and come to rest in the heap at the toe.
    const ride = 1 - (1 - p) ** 2;
    debris.forEach((d, k) => {
      const along = Math.min(d.end * ride, frontAt(p) - 0.02);
      const [x, z] = [ax + dx * along * len - dz * d.side * r, az + dz * along * len + dx * d.side * r];
      const depth = earthDepth(along, Math.abs(d.side), x, z, p);
      const rolled = (along * len) / d.size;
      const bounce = Math.abs(Math.sin(rolled * 0.7 + d.spin)) * 0.6 * (1 - p);
      if (k < ROCKS) {
        o.position.set(x, elevationAt(x, z) + depth * 0.7 + d.size * 0.4 + bounce, z);
        o.rotation.set(rolled + d.spin, d.spin, rolled * 0.3);
        o.scale.setScalar(d.size);
        o.updateMatrix();
        rk.setMatrixAt(k, o.matrix);
      } else {
        o.position.set(x, elevationAt(x, z) + depth * 0.8 + 0.25 + bounce, z);
        o.rotation.set(0, heading + (d.spin - 3) * 0.15, 0);
        o.rotateX(rolled);
        o.rotateZ(Math.PI / 2);
        o.scale.set(1, 3.5 + d.size * 2, 1);
        o.updateMatrix();
        lg.setMatrixAt(k - ROCKS, o.matrix);
      }
    });
    rk.instanceMatrix.needsUpdate = true;
    lg.instanceMatrix.needsUpdate = true;
  });

  if (!geometry) return null;
  return (
    <>
      <group ref={(g) => void (signs.current[0] = g)} visible={false}>
        <instancedMesh ref={crack} args={[undefined, undefined, 9]} frustumCulled={false}>
          <boxGeometry />
          <meshStandardMaterial color="#1b120b" roughness={1} />
        </instancedMesh>
      </group>
      <group ref={(g) => void (signs.current[1] = g)} visible={false}>
        <group>
          <group ref={lean}>
            <Suspense fallback={null}>
              <Model src={M.trees[1]} fit={{ height: 7 }} />
            </Suspense>
          </group>
        </group>
      </group>
      <group ref={(g) => void (signs.current[2] = g)} visible={false}>
        <group>
          <group ref={stream}>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
              <circleGeometry args={[1.2, 24]} />
              <meshStandardMaterial color="#6d4f33" roughness={0.25} transparent opacity={0.9} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 2.6]}>
              <planeGeometry args={[0.6, 4.4]} />
              <meshStandardMaterial color="#6d4f33" roughness={0.25} transparent opacity={0.8} />
            </mesh>
          </group>
        </group>
      </group>
      <mesh ref={mass} geometry={geometry} visible={false} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} flatShading />
      </mesh>
      <instancedMesh ref={rocks} args={[undefined, undefined, ROCKS]} visible={false} castShadow frustumCulled={false}>
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#5b5148" flatShading />
      </instancedMesh>
      <instancedMesh ref={logs} args={[undefined, undefined, LOGS]} visible={false} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.2, 0.26, 1, 8]} />
        <meshStandardMaterial color="#4a3426" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={puffs} args={[undefined, undefined, FRONT_PUFFS]} visible={false} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#8a7563" transparent opacity={0.45} depthWrite={false} roughness={1} />
      </instancedMesh>
    </>
  );
}

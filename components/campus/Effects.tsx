"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, Object3D, PlaneGeometry, type Group, type InstancedMesh, type Mesh } from "three";
import Character, { type Anim, type Look } from "@/components/Character";
import Model, { M } from "@/components/Model";
import { ASSEMBLY, MAP, TILE, W, elevationAt, findTiles, surfaceAt, tileCenter, tileElevation } from "@/lib/campus";
import { PLAN, STOREY, classrooms } from "@/lib/floorplan";
import { distanceAt, free, groundY, layerAt, nextStep } from "@/lib/nav";
import { WALK_SPEED, random, vortexAt, waterLevel, within } from "@/lib/sim";
import { CLASSMATE_SEATS, aftershockAt, drillTime, getState, landslideSigns, roomSeats, run, shakingAt } from "./drillStore";
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
function Classmate({ i }: { i: number }) {
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
          mates.forEach((o, j) => {
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

const SLIDE_S = 6;
const ROCKS = 36;

// Every lane a slope could slide down, so one plane can take the shape of whichever gives way.
const BOUNDS = MAP.runouts.reduce(
  ([x0, x1, z0, z1], { ax, az, bx, bz, r }) => [Math.min(x0, ax - r, bx - r), Math.max(x1, ax + r, bx + r), Math.min(z0, az - r, bz - r), Math.max(z1, az + r, bz + r)],
  [Infinity, -Infinity, Infinity, -Infinity],
);

// Warning signs on the slope, then the slope giving way down the drill's lane.
export function Landslide() {
  const signs = useRef<(Group | null)[]>([]);
  const lean = useRef<Group>(null);
  const mass = useRef<Mesh>(null);
  const rocks = useRef<InstancedMesh>(null);
  const shaped = useRef("");
  const o = useMemo(() => new Object3D(), []);
  const geometry = useMemo(() => {
    if (!MAP.runouts.length) return null;
    const [x0, x1, z0, z1] = BOUNDS;
    const geo = new PlaneGeometry(x1 - x0, z1 - z0, 72, 48);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    return geo;
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
    landslideSigns().forEach((sign, i) => {
      const g = signs.current[i];
      if (!g) return;
      g.visible = t >= run.timeline.signs[i];
      g.position.set(sign.x, elevationAt(sign.x, sign.z), sign.z);
    });
    // The second sign is a tree leaning further downhill as the ground creeps.
    if (lean.current) {
      lean.current.parent!.rotation.y = Math.atan2(dx, dz);
      lean.current.rotation.x = Math.min(0.4, Math.max(0, t - run.timeline.signs[1]) * 0.012);
    }
    const slide = run.timeline.slide;
    const p = on && slide !== null ? Math.min(1, Math.max(0, (t - slide) / SLIDE_S)) : 0;
    const m = mass.current;
    const rk = rocks.current;
    if (!m || !rk) return;
    m.visible = rk.visible = p > 0;
    const key = `${run.lane}:${p}`;
    if (p === 0 || shaped.current === key) return;
    shaped.current = key;
    // Earth runs from above the slope down the lane: thickest along its middle, arriving front first.
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const along = ((x - ax) * dx + (z - az) * dz) / len;
      const across = Math.abs((x - ax) * -dz + (z - az) * dx) / r;
      const depth = across < 1 && along >= -0.15 && along <= 1.05 ? 1.6 * (1 - across * across) * Math.min(1, Math.max(0, (p * 1.15 - along) * 4)) : 0;
      pos.setY(i, elevationAt(x, z) + (depth > 0.05 ? depth : -1));
    }
    pos.needsUpdate = true;
    m.geometry.computeVertexNormals();
    for (let k = 0; k < ROCKS; k++) {
      const along = ((k * 0.618) % 1) * p * len;
      const side = (((k * 0.37) % 1) - 0.5) * r * 1.4;
      const x = ax + dx * along - dz * side;
      const z = az + dz * along + dx * side;
      const size = 0.4 + ((k * 0.73) % 1) * 0.8;
      o.position.set(x, elevationAt(x, z) + 1 + size / 2, z);
      o.rotation.set(p * 9 + k, p * 7 + k, k);
      o.scale.setScalar(size);
      o.updateMatrix();
      rk.setMatrixAt(k, o.matrix);
    }
    rk.instanceMatrix.needsUpdate = true;
  });

  if (!geometry) return null;
  return (
    <>
      <group ref={(g) => void (signs.current[0] = g)} visible={false}>
        {[0, 1, 2].map((k) => (
          <mesh key={k} position={[k * 0.9 - 0.9, 0.03, k * 0.6 - 0.6]} rotation-y={0.5 + k * 0.35}>
            <boxGeometry args={[0.14, 0.06, 4.5 - k]} />
            <meshStandardMaterial color="#2c1f15" />
          </mesh>
        ))}
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
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
          <circleGeometry args={[1.4, 24]} />
          <meshStandardMaterial color="#7a5a3c" transparent opacity={0.85} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[-2.6, 0.05, 0]}>
          <planeGeometry args={[4.4, 0.7]} />
          <meshStandardMaterial color="#7a5a3c" transparent opacity={0.75} />
        </mesh>
      </group>
      <mesh ref={mass} geometry={geometry} visible={false} castShadow receiveShadow>
        <meshStandardMaterial color="#6b4a2f" roughness={1} flatShading />
      </mesh>
      <instancedMesh ref={rocks} args={[undefined, undefined, ROCKS]} visible={false} castShadow frustumCulled={false}>
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#5b5148" flatShading />
      </instancedMesh>
    </>
  );
}

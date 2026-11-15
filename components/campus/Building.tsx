"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type MeshStandardMaterial,
} from "three";
import Html from "@/components/Html";
import { Instances, preloadModels } from "@/components/Model";
import { BUILDINGS } from "@/lib/campus";
import { CEILING, PLAN, STOREY, WALL, type Box, type Door, type Furniture, type Part, type PartKind, type Spot } from "@/lib/floorplan";
import { buildingAt } from "@/lib/nav";
import { random } from "@/lib/sim";
import { aftershockAt, collapsed, drillTime, fallTilt, getState, player, run, shakingAt, useDrill } from "./drillStore";
import { fadeTo, hides } from "./fade";

const furniture = (m: Furniture) => `/models/furniture/${m}.glb`;
preloadModels([...new Set(PLAN.items.map((i) => furniture(i.model)))]);

// Kit models whose front is not +z, turned so `ry` in the plan means the way they face.
const TURN: Partial<Record<Furniture, number>> = {};

const WALL_COLOR = "#efe3c8";
const COLOR: Partial<Record<PartKind, string>> = {
  wall: WALL_COLOR,
  floor: "#d6cdbb",
  column: "#f6f2ea",
  rail: "#5f6873",
  step: "#cbc2ad",
  board: "#f4f6f2",
};
// The painted lower band of Indonesian school walls, and the tiled wainscot inside.
const BAND_COLOR = "#7f8f78";
const BAND = 0.9;
const riskColor = (r: number) => new Color(WALL_COLOR).lerp(new Color("#e0473c"), r / 100);
const UNIT = new BoxGeometry();

function Plain({ boxes, children, shadow = false }: { boxes: Box[]; children: React.ReactNode; shadow?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new Object3D();
    boxes.forEach((p, i) => {
      o.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2);
      o.scale.set(p.x1 - p.x0, p.y1 - p.y0, p.z1 - p.z0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes]);
  return (
    <instancedMesh ref={ref} args={[UNIT, undefined, boxes.length]} castShadow={shadow} receiveShadow={shadow}>
      {children}
    </instancedMesh>
  );
}

// Rows of clay tiles (genteng), each row shading the top of the one below.
function roofTiles() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * 32 + (row % 2) * 16;
      g.fillStyle = `hsl(${14 + ((col * 7 + row * 3) % 5)} 58% ${38 + ((col * 5 + row) % 4) * 2}%)`;
      g.fillRect(x - 32, row * 32, 32, 32);
      g.fillRect(x + 224, row * 32, 32, 32);
      g.fillRect(x, row * 32, 32, 32);
      g.fillStyle = "rgb(0 0 0 / 0.18)";
      g.fillRect(x, row * 32, 2, 32);
    }
    const shade = g.createLinearGradient(0, row * 32, 0, row * 32 + 32);
    shade.addColorStop(0, "rgb(0 0 0 / 0.35)");
    shade.addColorStop(0.25, "rgb(0 0 0 / 0)");
    shade.addColorStop(0.85, "rgb(255 255 255 / 0.08)");
    shade.addColorStop(1, "rgb(0 0 0 / 0.25)");
    g.fillStyle = shade;
    g.fillRect(0, row * 32, 256, 32);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

function Boxes({ parts, colorOf }: { parts: Part[]; colorOf: (p: Part) => Color | string }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new Object3D();
    const c = new Color();
    parts.forEach((p, i) => {
      o.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2);
      o.scale.set(p.x1 - p.x0, p.y1 - p.y0, p.z1 - p.z0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(colorOf(p)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    (mesh.material as MeshStandardMaterial).needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts, colorOf]);
  return (
    <instancedMesh ref={ref} args={[UNIT, undefined, parts.length]} castShadow receiveShadow>
      <meshStandardMaterial />
    </instancedMesh>
  );
}

// Glass parts are made alongside PLAN.panes, in the same order, so a pane's index finds its part.
const PANE_OF = new Map(PLAN.parts.filter((p) => p.kind === "glass").map((p, i) => [p, i]));

function Glass({ parts }: { parts: Part[] }) {
  const ref = useRef<InstancedMesh>(null);
  const broken = useRef("");
  const place = useCallback(
    (gone: (p: Part) => boolean) => {
      const mesh = ref.current!;
      const o = new Object3D();
      parts.forEach((p, i) => {
        o.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2);
        o.scale.set(p.x1 - p.x0, gone(p) ? 0 : p.y1 - p.y0, p.z1 - p.z0);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    },
    [parts],
  );
  useLayoutEffect(() => place(() => false), [place]);
  // A broken pane leaves an empty frame; the shards on the floor are drawn with the other quake effects.
  useFrame(() => {
    const t = getState().phase === "idle" ? -1 : drillTime();
    const gone = (p: Part) => {
      const at = run.breaks.get(PANE_OF.get(p)!);
      return at !== undefined && t >= at;
    };
    const key = parts.map((p) => (gone(p) ? 1 : 0)).join("");
    if (key === broken.current) return;
    broken.current = key;
    place(gone);
  });
  return (
    <instancedMesh ref={ref} args={[UNIT, undefined, parts.length]} receiveShadow>
      <meshStandardMaterial color="#bcd9ea" transparent opacity={0.35} roughness={0.15} depthWrite={false} />
    </instancedMesh>
  );
}

// Hinged at one jamb on the outer face; opening swings the leaf out and back flat against the wall.
function DoorLeaf({ d }: { d: Door }) {
  const closed = useDrill((s) => s.closedDoors.includes(d.id));
  const ref = useRef<Group>(null);
  const t = useRef(1);
  const [ax, az] = d.along === "x" ? [1, 0] : [0, 1];
  const hx = d.x - (ax * d.w) / 2 + d.out[0] * (WALL / 2 + 0.03);
  const hz = d.z - (az * d.w) / 2 + d.out[1] * (WALL / 2 + 0.03);
  const shut = Math.atan2(-az, ax);
  const swing = d.along === "x" ? -d.out[1] : d.out[0];
  useFrame((_, dt) => {
    const g = ref.current;
    const target = closed ? 0 : 1;
    if (!g || Math.abs(t.current - target) < 0.001) return;
    t.current += (target - t.current) * (1 - Math.exp(-dt * 8));
    g.rotation.y = shut + swing * Math.PI * t.current;
  });
  return (
    <group ref={ref} position={[hx, d.y, hz]} rotation-y={shut + swing * Math.PI}>
      <mesh position={[(d.w - 0.04) / 2, 1.03, 0]} castShadow>
        <boxGeometry args={[d.w - 0.04, 2.05, 0.04]} />
        <meshStandardMaterial color="#7a4a2b" />
      </mesh>
    </group>
  );
}

function SpotMesh({ s }: { s: Spot }) {
  const on = useDrill((st) => (s.kind === "mcb" ? st.power : s.kind === "gas" ? st.gas : true));
  return (
    <group position={[s.x, s.y, s.z]} rotation-y={s.ry}>
      {s.kind === "peta" && (
        <>
          <mesh position={[0, 0, 0.015]}>
            <boxGeometry args={[0.7, 0.5, 0.03]} />
            <meshStandardMaterial color="#0f7a45" />
          </mesh>
          <mesh position={[0, 0, 0.032]}>
            <boxGeometry args={[0.6, 0.4, 0.005]} />
            <meshStandardMaterial color="#e8f3ea" />
          </mesh>
        </>
      )}
      {s.kind === "mcb" && (
        <>
          <mesh position={[0, 0, 0.06]} castShadow>
            <boxGeometry args={[0.36, 0.5, 0.12]} />
            <meshStandardMaterial color="#8d949c" metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0, on ? 0.08 : -0.08, 0.13]}>
            <boxGeometry args={[0.2, 0.06, 0.03]} />
            <meshStandardMaterial color={on ? "#1d2229" : "#d9483b"} />
          </mesh>
        </>
      )}
      {s.kind === "kentongan" && (
        <>
          <mesh position={[0, 1.2, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.5, 4]} />
            <meshStandardMaterial color="#4b3a2a" />
          </mesh>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.13, 0.9, 12]} />
            <meshStandardMaterial color="#8a5a33" />
          </mesh>
          <mesh position={[0, 0.5, 0.125]}>
            <boxGeometry args={[0.04, 0.6, 0.02]} />
            <meshStandardMaterial color="#2a1c12" />
          </mesh>
        </>
      )}
      {s.kind === "gas" && (
        <>
          <mesh position={[0, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.16, 0.4, 16]} />
            <meshStandardMaterial color="#3f9b4a" />
          </mesh>
          <mesh position={[0, 0.44, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 0.08, 8]} />
            <meshStandardMaterial color="#c9c9c9" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.5, 0]} rotation-y={on ? 0 : Math.PI / 2}>
            <boxGeometry args={[0.14, 0.025, 0.03]} />
            <meshStandardMaterial color={on ? "#d9483b" : "#2f9e5b"} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Storey({ b, floor, risk, showRisk }: { b: string; floor: number; risk: number; showRisk: boolean }) {
  const { opaque, bands, glass, items, doors, spots } = useMemo(() => {
    const parts = PLAN.parts.filter((p) => p.b === b && p.floor === floor && p.kind !== "under" && p.kind !== "roof");
    const items: Partial<Record<Furniture, typeof PLAN.items>> = {};
    const index: Partial<Record<Furniture, number[]>> = {};
    PLAN.items.forEach((it, i) => {
      if (it.b !== b || it.floor !== floor) return;
      (items[it.model] ??= []).push(it);
      (index[it.model] ??= []).push(i);
    });
    return {
      opaque: parts.filter((p) => p.kind !== "glass"),
      // A skin a centimetre proud of every wall piece that stands on the floor, both faces at once.
      bands: parts
        .filter((p) => p.kind === "wall" && Math.abs(p.y0 - (PLAN.floorY[b] + floor * STOREY)) < 0.05)
        .map((p) => ({ x0: p.x0 - 0.01, x1: p.x1 + 0.01, z0: p.z0 - 0.01, z1: p.z1 + 0.01, y0: p.y0, y1: Math.min(p.y1, p.y0 + BAND) })),
      glass: parts.filter((p) => p.kind === "glass"),
      items: (Object.entries(items) as [Furniture, typeof PLAN.items][]).map(([model, list]) => {
        const ids = index[model]!;
        // Only tall pieces can topple, so only they pay for a per-frame check.
        const tilt = list.some((it) => it.size[1] >= 1.5) ? (k: number) => fallTilt(ids[k]) : undefined;
        return [model, list, tilt] as const;
      }),
      doors: PLAN.doors.filter((d) => d.b === b && d.floor === floor),
      spots: PLAN.spots.filter((s) => s.b === b && s.floor === floor),
    };
  }, [b, floor]);
  const colorOf = useCallback(
    (p: Part) => p.color ?? (p.kind === "wall" && showRisk ? riskColor(risk) : (COLOR[p.kind] ?? WALL_COLOR)),
    [showRisk, risk],
  );
  return (
    <>
      {opaque.length > 0 && <Boxes parts={opaque} colorOf={colorOf} />}
      {bands.length > 0 && (
        <Plain boxes={bands} shadow>
          <meshStandardMaterial color={BAND_COLOR} roughness={0.7} />
        </Plain>
      )}
      {glass.length > 0 && <Glass parts={glass} />}
      <Suspense fallback={null}>
        {items.map(([model, list, tilt]) => (
          <Instances key={model} src={furniture(model)} items={list} turn={TURN[model] ?? 0} tilt={tilt} />
        ))}
      </Suspense>
      {doors.map((d) => (
        <DoorLeaf key={d.id} d={d} />
      ))}
      {spots.map((s, i) => (
        <SpotMesh key={i} s={s} />
      ))}
    </>
  );
}

// Ceilings face away from the sky light, so they are drawn evenly lit; the lamps go dark when the power is cut.
function Ceilings({ b }: { b: string }) {
  const power = useDrill((s) => s.power);
  const { panels, lamps } = useMemo(() => {
    const floors = BUILDINGS[b].floors;
    const panels: Box[] = [];
    const lamps: Box[] = [];
    for (const r of PLAN.rooms) {
      // The stairwell is open to the floor above.
      if (r.b !== b || (r.kind === "tangga" && r.floor < floors - 1)) continue;
      const y = PLAN.floorY[b] + r.floor * STOREY + CEILING;
      panels.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: y - 0.02, y1: y });
      if (r.kind === "tangga") continue;
      const [w, d] = [r.x1 - r.x0, r.z1 - r.z0];
      const alongX = w >= d;
      const [long, short] = alongX ? [w, d] : [d, w];
      const n = Math.max(1, Math.round(long / 4));
      const m = r.kind === "selasar" ? 1 : Math.max(1, Math.round(short / 3.5));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          const [a, c] = [((i + 0.5) / n) * long, ((j + 0.5) / m) * short];
          const [x, z] = alongX ? [r.x0 + a, r.z0 + c] : [r.x0 + c, r.z0 + a];
          const [hx, hz] = alongX ? [0.6, 0.08] : [0.08, 0.6];
          lamps.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y0: y - 0.07, y1: y - 0.02 });
        }
      }
    }
    return { panels, lamps };
  }, [b]);
  if (BUILDINGS[b].kind === "kantin") return null;
  return (
    <>
      <Plain boxes={panels}>
        <meshBasicMaterial color={power ? "#e6e2d9" : "#9c988f"} />
      </Plain>
      <Plain boxes={lamps}>
        <meshStandardMaterial color="#f2f2ee" emissive="#fff6dc" emissiveIntensity={power ? 1.4 : 0} />
      </Plain>
    </>
  );
}

function Roof({ b }: { b: string }) {
  const info = BUILDINGS[b];
  const fp = PLAN.footprint[b];
  const top = PLAN.floorY[b] + info.floors * STOREY;
  const [w, d] = [fp.x1 - fp.x0, fp.z1 - fp.z0];
  const [cx, cz] = [(fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2];
  // One texture row block is 4 rows of 0.33 m tiles; around the eaves, 8 tiles of 0.3 m.
  const map = useMemo(() => {
    const t = roofTiles();
    t.repeat.set((2 * (w + d + 3.2)) / 2.4, Math.hypot(2.2, Math.min(w, d) / 2 + 0.8) / 1.32);
    return t;
  }, [w, d]);
  if (info.kind === "kantin") {
    // Light zinc sheets on a low gable: the roof a whirlwind strips first.
    const eave = PLAN.floorY[b] + 3.2;
    const run = d / 2 + 0.6;
    const slope = Math.atan2(1.2, run);
    return [-1, 1].map((side) => (
      <mesh key={side} position={[cx, eave + 0.6, cz + (side * run) / 2]} rotation-x={side * slope} castShadow receiveShadow>
        <boxGeometry args={[w + 1, 0.06, Math.hypot(run, 1.2)]} />
        <meshStandardMaterial color="#8d9ba6" metalness={0.35} roughness={0.55} />
      </mesh>
    ));
  }
  if (info.kind === "musholla") {
    return (
      <group position={[cx, top, cz]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[w + 0.4, 0.4, d + 0.4]} />
          <meshStandardMaterial color="#e6dcc6" />
        </mesh>
        <mesh position={[0, 0.4, 0]} castShadow>
          <sphereGeometry args={[2.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#2c8a5a" />
        </mesh>
        <mesh position={[0, 3.2, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 1, 6]} />
          <meshStandardMaterial color="#e2c56a" />
        </mesh>
      </group>
    );
  }
  // A 4-sided cone turned 45° is a hip roof; the outer scale stretches it to the footprint.
  return (
    <group position={[cx, top + 1.1, cz]} scale={[(w + 1.6) / Math.SQRT2, 1, (d + 1.6) / Math.SQRT2]}>
      <mesh rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[1, 2.2, 4]} />
        <meshStandardMaterial map={map} flatShading />
      </mesh>
    </group>
  );
}

const ROOF_OF: Record<string, string> = { kantin: "#8d9ba6", musholla: "#2c8a5a" };
const FALL_S = 3;
const PUFFS = 16;

// A building coming down: every wall, column and slab drops and topples into a heap on its own footprint
// (shoved downhill by a slide), the roof caves in on top, and a cloud of dust rolls out and settles.
function Collapse({ b }: { b: string }) {
  const group = useRef<Group>(null);
  const pieces = useRef<InstancedMesh>(null);
  const heap = useRef<Group>(null);
  const dust = useRef<InstancedMesh>(null);
  const settled = useRef("");
  const o = useMemo(() => new Object3D(), []);
  const { list, lumps, ground, fp, high } = useMemo(() => {
    const fp = PLAN.footprint[b];
    const floors = BUILDINGS[b].floors;
    const ground = PLAN.floorY[b];
    const [cx, cz, hw, hd] = [(fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2, (fp.x1 - fp.x0) / 2, (fp.z1 - fp.z0) / 2];
    const high = 0.7 + 0.8 * floors;
    const rnd = random(b.charCodeAt(0) * 7919);
    // Long walls and slabs break into pieces of at most 2.5 m, a storey's wall into a lower and an upper half.
    const boxes: (Box & { color: string })[] = PLAN.parts
      .filter((p) => p.b === b && p.kind !== "glass" && p.kind !== "roof" && p.kind !== "under")
      .flatMap((p) => {
        const color = p.color ?? COLOR[p.kind] ?? WALL_COLOR;
        const alongX = p.x1 - p.x0 >= p.z1 - p.z0;
        const [a0, a1] = alongX ? [p.x0, p.x1] : [p.z0, p.z1];
        const n = Math.ceil((a1 - a0) / 2.5);
        const rows = p.y1 - p.y0 > 2 ? 2 : 1;
        return Array.from({ length: n * rows }, (_, k) => {
          const [s0, s1] = [a0 + ((a1 - a0) * (k % n)) / n, a0 + ((a1 - a0) * ((k % n) + 1)) / n];
          const [y0, y1] = [p.y0 + ((p.y1 - p.y0) * Math.floor(k / n)) / rows, p.y0 + ((p.y1 - p.y0) * (Math.floor(k / n) + 1)) / rows];
          return alongX ? { ...p, x0: s0, x1: s1, y0, y1, color } : { ...p, z0: s0, z1: s1, y0, y1, color };
        });
      });
    // The roof breaks into slabs of tile, zinc or dome scattered over the top of the heap.
    const top = ground + floors * STOREY;
    for (let k = 0; k < 24; k++) {
      const [x, z] = [fp.x0 + rnd() * (fp.x1 - fp.x0), fp.z0 + rnd() * (fp.z1 - fp.z0)];
      const w = 1.2 + rnd() * 1.6;
      boxes.push({ x0: x - w, x1: x + w, z0: z - w * 0.7, z1: z + w * 0.7, y0: top + 0.6, y1: top + 0.75, color: ROOF_OF[BUILDINGS[b].kind] ?? "#b4532a" });
    }
    const list = boxes.map((p) => {
      const [x, y, z] = [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2];
      const [sx, sy, sz] = [p.x1 - p.x0, p.y1 - p.y0, p.z1 - p.z0];
      const u = Math.min(1, Math.max(Math.abs(x - cx) / hw, Math.abs(z - cz) / hd));
      const pile = high * (1 - 0.7 * u * u) * (0.35 + 0.65 * rnd());
      const rest = Math.min(y, ground + pile + Math.min(sx, sy, sz) / 2);
      const side = rnd() < 0.5 ? -1 : 1;
      // Upright pieces fall flat across their own length; slabs and roof only tilt.
      const flat = (Math.PI / 2) * (0.85 + 0.15 * rnd()) * side;
      const turn: [number, number, number] =
        sy > Math.max(sx, sz) ? (sx >= sz ? [flat, 0, 0] : [0, 0, flat]) : [(rnd() - 0.5) * 0.7, 0, (rnd() - 0.5) * 0.7];
      turn[1] = (rnd() - 0.5) * 0.6;
      return {
        x,
        y,
        z,
        sx,
        sy,
        sz,
        rest,
        turn,
        color: p.color,
        // Upper parts start falling a moment later, so it reads as giving way from the bottom up.
        delay: rnd() * 0.35 + ((y - ground) / (floors * STOREY + 1)) * 0.3,
        fall: Math.max(0.25, Math.sqrt((2 * (y - rest)) / 9.8)),
        spread: [(x - cx) * 0.12 * rnd(), (z - cz) * 0.12 * rnd()] as [number, number],
        shove: 3 + 5 * rnd(),
      };
    });
    // Lumps of broken masonry under it all, bigger toward the middle.
    const lumps = Array.from({ length: 14 }, (_, k) => {
      const u = k === 0 ? 0 : 0.25 + 0.6 * rnd();
      const a = rnd() * Math.PI * 2;
      const size = high * (k === 0 ? 0.7 : 0.35 + 0.35 * rnd()) * (1 - 0.4 * u);
      return { x: cx + Math.cos(a) * hw * u, z: cz + Math.sin(a) * hd * u, s: [size * (1.4 + rnd()), size, size * (1.4 + rnd())] as const, ry: rnd() * Math.PI };
    });
    return { list, lumps, ground, fp, high };
  }, [b]);

  useLayoutEffect(() => {
    const mesh = pieces.current!;
    const c = new Color();
    list.forEach((p, i) => mesh.setColorAt(i, c.set(p.color)));
    mesh.instanceColor!.needsUpdate = true;
  }, [list]);

  useFrame(() => {
    const g = group.current;
    const mesh = pieces.current;
    const m = heap.current;
    const d = dust.current;
    const c = run.collapses.get(b);
    if (!g || !mesh || !m || !d) return;
    g.visible = !!c && collapsed(b);
    if (!g.visible || !c) return;
    const t = drillTime() - c.at;
    // Once everything has landed the heap stays as it is; only the dust still moves.
    const key = `${getState().startAt}`;
    if (t < FALL_S + 0.5 || settled.current !== key) {
      if (t >= FALL_S + 0.5) settled.current = key;
      const push = c.push ?? [0, 0];
      list.forEach((p, i) => {
        const f = Math.min(1, Math.max(0, (t - p.delay) / p.fall));
        const k = f * f * (3 - 2 * f);
        o.position.set(
          p.x + (p.spread[0] + push[0] * p.shove) * f,
          p.y - (p.y - p.rest) * f * f,
          p.z + (p.spread[1] + push[1] * p.shove) * f,
        );
        o.rotation.set(p.turn[0] * k, p.turn[1] * k, p.turn[2] * k);
        o.scale.set(p.sx, p.sy, p.sz);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      const rise = Math.min(1, Math.max(0, (t - 0.3) / 1.4));
      m.position.y = ground - high * (1 - rise);
    }
    const age = t / 8;
    d.visible = age < 1;
    if (!d.visible) return;
    (d.material as MeshStandardMaterial).opacity = 0.55 * (1 - age) ** 1.5;
    const [cx, cz] = [(fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2];
    for (let k = 0; k < PUFFS; k++) {
      const a = (k / PUFFS) * Math.PI * 2;
      const out = 0.4 + 0.9 * Math.sqrt(age);
      o.position.set(cx + Math.cos(a) * (fp.x1 - fp.x0) * 0.5 * out, ground + 1 + age * 4 + (k % 3), cz + Math.sin(a) * (fp.z1 - fp.z0) * 0.5 * out);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(2 + age * 4 + (k % 4) * 0.5);
      o.updateMatrix();
      d.setMatrixAt(k, o.matrix);
    }
    d.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group} visible={false}>
      <instancedMesh ref={pieces} args={[UNIT, undefined, list.length]} castShadow receiveShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <group ref={heap}>
        {lumps.map((l, k) => (
          <mesh key={k} position={[l.x, 0, l.z]} scale={l.s} rotation-y={l.ry} castShadow receiveShadow>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={k % 3 ? "#7d766c" : "#9a8f80"} roughness={1} flatShading />
          </mesh>
        ))}
      </group>
      <instancedMesh ref={dust} args={[undefined, undefined, PUFFS]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#b5a893" transparent depthWrite={false} roughness={1} />
      </instancedMesh>
    </group>
  );
}

function Building({ id, risk, showRisk, fade }: { id: string; risk: number; showRisk: boolean; fade: boolean }) {
  const ref = useRef<Group>(null);
  const standing = useRef<Group>(null);
  const opacity = useRef(1);
  const info = BUILDINGS[id];
  const fp = PLAN.footprint[id];
  const base = PLAN.base[id];
  const [cx, cz] = [(fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2];
  const top = PLAN.floorY[id] + info.floors * STOREY + 2.4;
  const camera = useThree((s) => s.camera);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !standing.current) return;
    standing.current.visible = !collapsed(id);
    const s = getState();
    const t = drillTime();
    const quake = s.phase === "running" && s.scenario.kind === "gempa";
    const strength = quake && shakingAt(t) ? 0.5 : quake && aftershockAt(t) ? 0.2 : 0;
    // Weaker blocks visibly sway more: the risk model, shown rather than told.
    const sway = (0.002 + (risk / 100) * 0.012) * (s.scenario.intensity - 4) * strength;
    g.rotation.z = strength ? Math.sin(t * 17 + fp.x0) * sway : 0;
    g.rotation.x = strength ? Math.cos(t * 13 + fp.z0) * sway * 0.6 : 0;
    if (!fade) return;
    const inside = buildingAt(player.x, player.z) === id;
    const target = !inside && hides(camera.position, top, fp.x0 - 1.5, fp.z0 - 1.5, fp.x1 + 1.5, fp.z1 + 1.5) ? 0.28 : 1;
    if (Math.abs(opacity.current - target) < 0.01) return;
    opacity.current += (target - opacity.current) * (1 - Math.exp(-dt * 10));
    fadeTo(g, opacity.current);
  });

  return (
    <>
      <Collapse b={id} />
      <group ref={ref} position={[cx, base, cz]}>
        <group ref={standing} position={[-cx, -base, -cz]}>
          {Array.from({ length: info.floors + 1 }, (_, f) => (
            <Storey key={f} b={id} floor={f} risk={risk} showRisk={showRisk} />
          ))}
          <Ceilings b={id} />
          <Roof b={id} />
        </group>
        {showRisk && (
          <Html position={[0, top - base + 1, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
            <div className="whitespace-nowrap rounded bg-malam/90 px-2 py-1 text-center text-xs text-pasir">
              <div className="font-semibold">{info.name}</div>
              <div>
                Risiko rusak <strong className={risk >= 60 ? "text-bahaya" : "text-fajar"}>{risk}%</strong>
              </div>
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

export function Buildings({ risks, showRisk, fade = false }: { risks: Record<string, number>; showRisk: boolean; fade?: boolean }) {
  return Object.keys(BUILDINGS).map((id) => <Building key={id} id={id} risk={risks[id] ?? 0} showRisk={showRisk} fade={fade} />);
}

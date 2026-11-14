"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, Object3D, type Group, type InstancedMesh, type MeshStandardMaterial } from "three";
import Html from "@/components/Html";
import { Instances, preloadModels } from "@/components/Model";
import { BUILDINGS } from "@/lib/campus";
import { PLAN, STOREY, WALL, type Door, type Furniture, type Part, type PartKind, type Spot } from "@/lib/floorplan";
import { buildingAt } from "@/lib/nav";
import { QUAKE_SHAKE_S } from "@/lib/sim";
import { getState, player, useDrill } from "./drillStore";
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
const riskColor = (r: number) => new Color(WALL_COLOR).lerp(new Color("#e0473c"), r / 100);
const UNIT = new BoxGeometry();

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

function Glass({ parts }: { parts: Part[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new Object3D();
    parts.forEach((p, i) => {
      o.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2);
      o.scale.set(p.x1 - p.x0, p.y1 - p.y0, p.z1 - p.z0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);
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
  const { opaque, glass, items, doors, spots } = useMemo(() => {
    const parts = PLAN.parts.filter((p) => p.b === b && p.floor === floor && p.kind !== "under" && p.kind !== "roof");
    const items: Partial<Record<Furniture, typeof PLAN.items>> = {};
    for (const it of PLAN.items) if (it.b === b && it.floor === floor) (items[it.model] ??= []).push(it);
    return {
      opaque: parts.filter((p) => p.kind !== "glass"),
      glass: parts.filter((p) => p.kind === "glass"),
      items: Object.entries(items) as [Furniture, typeof PLAN.items][],
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
      {glass.length > 0 && <Glass parts={glass} />}
      <Suspense fallback={null}>
        {items.map(([model, list]) => (
          <Instances key={model} src={furniture(model)} items={list} turn={TURN[model] ?? 0} />
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

function Roof({ b }: { b: string }) {
  const info = BUILDINGS[b];
  const fp = PLAN.footprint[b];
  const top = PLAN.floorY[b] + info.floors * STOREY;
  const [w, d] = [fp.x1 - fp.x0, fp.z1 - fp.z0];
  const [cx, cz] = [(fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2];
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
        <meshStandardMaterial color="#b4532a" flatShading />
      </mesh>
    </group>
  );
}

function Building({ id, risk, showRisk, fade }: { id: string; risk: number; showRisk: boolean; fade: boolean }) {
  const ref = useRef<Group>(null);
  const storeys = useRef<(Group | null)[]>([]);
  const opacity = useRef(1);
  const info = BUILDINGS[id];
  const fp = PLAN.footprint[id];
  const base = PLAN.base[id];
  const [cx, cz] = [(fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2];
  const top = PLAN.floorY[id] + info.floors * STOREY + 2.4;
  const camera = useThree((s) => s.camera);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const s = getState();
    const t = (Date.now() - s.startAt) / 1000;
    const shaking = s.phase === "running" && s.scenario.kind === "gempa" && t >= 0 && t < QUAKE_SHAKE_S;
    // Weaker blocks visibly sway more: the risk model, shown rather than told.
    const sway = shaking ? (0.002 + (risk / 100) * 0.012) * (s.scenario.intensity - 4) * 0.5 : 0;
    g.rotation.z = Math.sin(t * 17 + fp.x0) * sway;
    g.rotation.x = Math.cos(t * 13 + fp.z0) * sway * 0.6;
    // Walking in cuts the building away above the player, like lifting the lid of a dollhouse.
    const inside = buildingAt(player.x, player.z) === id;
    storeys.current.forEach((sg, f) => {
      if (sg) sg.visible = !inside || f <= player.layer;
    });
    if (!fade) return;
    const target = !inside && hides(camera.position, top, fp.x0 - 1.5, fp.z0 - 1.5, fp.x1 + 1.5, fp.z1 + 1.5) ? 0.28 : 1;
    if (Math.abs(opacity.current - target) < 0.01) return;
    opacity.current += (target - opacity.current) * (1 - Math.exp(-dt * 10));
    fadeTo(g, opacity.current);
  });

  return (
    <group ref={ref} position={[cx, base, cz]}>
      <group position={[-cx, -base, -cz]}>
        {Array.from({ length: info.floors + 1 }, (_, f) => (
          <group
            key={f}
            ref={(g) => {
              storeys.current[f] = g;
            }}
          >
            <Storey b={id} floor={f} risk={risk} showRisk={showRisk} />
            {f === info.floors && <Roof b={id} />}
          </group>
        ))}
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
  );
}

export function Buildings({ risks, showRisk, fade = false }: { risks: Record<string, number>; showRisk: boolean; fade?: boolean }) {
  return Object.keys(BUILDINGS).map((id) => <Building key={id} id={id} risk={risks[id] ?? 0} showRisk={showRisk} fade={fade} />);
}

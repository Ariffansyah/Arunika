"use client";

import { Html, Line, Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  Color,
  Object3D,
  PlaneGeometry,
  type DirectionalLight,
  type InstancedMesh,
  type Mesh,
} from "three";
import {
  ASSEMBLY,
  ASSEMBLY_NAMES,
  BUILDINGS,
  GRID,
  H,
  W,
  WARDEN,
  buildingRects,
  elevationAt,
  findTiles,
  tileAt,
  tileElevation,
  type Tile,
} from "@/lib/campus";
import { waterLevel } from "@/lib/sim";
import type { School } from "@/lib/supabase";
import type { Look } from "@/components/Character";
import Avatar from "./Avatar";
import { getState, predict, setState, useDrill } from "./drillStore";
import Player from "./Player";
import RemotePlayers from "./RemotePlayers";
import type { Peer } from "./useRoom";

const GROUND: Record<string, string> = { ".": "#a59f8a", h: "#4f8a4a", g: "#5f9b4c", A: "#4f8a4a", B: "#5f9b4c" };

export function Terrain() {
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(W, H, W * 2, H * 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      // Same as rotating the plane flat, but with the height and tile colour baked in.
      const x = pos.getX(i) + W / 2;
      const z = -pos.getY(i) + H / 2;
      pos.setXYZ(i, x, elevationAt(x, z), z);
      c.set(GROUND[tileAt(Math.min(W - 1, Math.floor(x)), Math.min(H - 1, Math.floor(z)))] ?? GROUND["."]);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} />
    </mesh>
  );
}

export function Coast() {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0.02, H + 2]} receiveShadow>
        <planeGeometry args={[W + 60, 4]} />
        <meshStandardMaterial color="#d9c38e" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, -0.1, H + 34]}>
        <planeGeometry args={[W + 120, 60]} />
        <meshStandardMaterial color="#1e4f7a" roughness={0.3} />
      </mesh>
    </>
  );
}

type Placed = { x: number; z: number; sx?: number; sy?: number; sz?: number; color?: string };

function Instanced({ items, y, children }: { items: Placed[]; y: number; children: React.ReactNode }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new Object3D();
    const c = new Color();
    items.forEach((it, i) => {
      o.position.set(it.x + 0.5, tileElevation(it.x, it.z) + y * (it.sy ?? 1), it.z + 0.5);
      o.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (it.color) mesh.setColorAt(i, c.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, y]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      {children}
    </instancedMesh>
  );
}

// A thin wall segment per fence tile, turned to follow its neighbours; corners get both directions.
// tileAt pads the outside of the map with fence, so neighbours are read from GRID directly.
const isFence = (x: number, z: number) => GRID[z]?.[x] === "=";
const FENCE: Placed[] = findTiles("=").flatMap(([x, z]) => {
  const along = isFence(x - 1, z) || isFence(x + 1, z);
  const across = isFence(x, z - 1) || isFence(x, z + 1);
  return [
    ...(along ? [{ x, z, sz: 0.22 }] : []),
    ...(across || !along ? [{ x, z, sx: 0.22 }] : []),
  ];
});

const TREE_GREENS = ["#3f8f5a", "#2f7d55", "#4c9a52"];
const TREES: Placed[] = findTiles("T").map(([x, z]) => {
  const s = 0.8 + ((x * 37 + z * 17) % 10) / 20;
  return { x, z, sx: s, sy: s, sz: s, color: TREE_GREENS[(x + z) % TREE_GREENS.length] };
});

export function Props() {
  return (
    <>
      <Instanced items={FENCE} y={0.42}>
        <boxGeometry args={[1, 0.85, 1]} />
        <meshStandardMaterial color="#efe6d4" />
      </Instanced>
      <Instanced items={TREES} y={0.6}>
        <cylinderGeometry args={[0.12, 0.16, 1.2, 6]} />
        <meshStandardMaterial color="#6b4a2f" />
      </Instanced>
      <Instanced items={TREES} y={1.7}>
        <icosahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color="#ffffff" flatShading />
      </Instanced>
    </>
  );
}

const riskColor = (r: number) => new Color("#efe3c8").lerp(new Color("#e0473c"), r / 100);

const RECTS = buildingRects();

export function Buildings({ risks, showRisk }: { risks: Record<string, number>; showRisk: boolean }) {
  return Object.entries(RECTS).map(([id, r]) => {
    const b = BUILDINGS[id];
    const w = r.x1 - r.x0 + 1;
    const d = r.z1 - r.z0 + 1;
    const h = b.floors * 1.5;
    const base = Math.min(tileElevation(r.x0, r.z0), tileElevation(r.x1, r.z1)) - 0.1;
    return (
      <group key={id} position={[r.x0 + w / 2, base, r.z0 + d / 2]}>
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w - 0.1, h, d - 0.1]} />
          <meshStandardMaterial color={showRisk ? riskColor(risks[id]) : "#efe3c8"} />
        </mesh>
        {Array.from({ length: b.floors }, (_, f) => (
          <mesh key={f} position={[0, f * 1.5 + 0.85, d / 2 - 0.02]}>
            <boxGeometry args={[w * 0.8, 0.45, 0.06]} />
            <meshStandardMaterial color="#2b4a6b" />
          </mesh>
        ))}
        {/* A 4-sided cone turned 45° is a hip roof; the outer scale stretches it to the footprint. */}
        <group position={[0, h + 0.6, 0]} scale={[(w + 0.6) / Math.SQRT2, 1, (d + 0.6) / Math.SQRT2]}>
          <mesh rotation-y={Math.PI / 4} castShadow>
            <coneGeometry args={[1, 1.2, 4]} />
            <meshStandardMaterial color="#b4532a" flatShading />
          </mesh>
        </group>
        {showRisk && (
          <Html position={[0, h + 1.8, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
            <div className="whitespace-nowrap rounded bg-malam/90 px-2 py-1 text-center text-xs text-pasir">
              <div className="font-semibold">{b.name}</div>
              <div>
                Risiko rusak <strong className={risks[id] >= 60 ? "text-bahaya" : "text-fajar"}>{risks[id]}%</strong>
              </div>
            </div>
          </Html>
        )}
      </group>
    );
  });
}

function AssemblyPoints({ safe }: { safe: Tile[] }) {
  const phase = useDrill((s) => s.phase);
  return ASSEMBLY.map(([x, z]) => {
    const ok = safe.some(([sx, sz]) => sx === x && sz === z);
    const y = tileElevation(x, z);
    return (
      <group key={`${x}-${z}`} position={[x + 0.5, y, z + 0.5]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
          <ringGeometry args={[1.3, 1.6, 32]} />
          <meshStandardMaterial color={phase !== "idle" && !ok ? "#e0473c" : "#34c47c"} />
        </mesh>
        <mesh position={[0, 1, -1.6]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 2, 6]} />
          <meshStandardMaterial color="#cfd6de" />
        </mesh>
        <Html position={[0, 2.3, -1.6]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-[#11663a] px-2 py-1 text-center text-xs font-bold text-white">
            {ASSEMBLY_NAMES[tileAt(x, z)]}
            {phase !== "idle" && !ok && <div className="font-semibold text-[#ffd2cc]">Tidak aman</div>}
          </div>
        </Html>
      </group>
    );
  });
}

function Warden() {
  const near = useDrill((s) => s.nearWarden && !s.chatOpen);
  const [x, z] = WARDEN;
  return (
    <group position={[x + 0.5, tileElevation(x, z), z + 0.5]} rotation-y={Math.PI / 4}>
      <Avatar look="j" name="Petugas Keselamatan" anim={() => (getState().chatOpen ? "emote-yes" : "idle")} />
      {near && (
        <Html position={[0, 2.4, 0]} center zIndexRange={[30, 0]}>
          <button
            type="button"
            onClick={() => setState({ chatOpen: true })}
            className="min-h-11 whitespace-nowrap rounded-md bg-pasir px-3 text-sm font-semibold text-malam hover:bg-white active:translate-y-px"
          >
            Tanya petugas (E)
          </button>
        </Html>
      )}
    </group>
  );
}

function Water() {
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const s = getState();
    const m = ref.current;
    if (!m) return;
    const level = s.phase === "idle" ? 0 : waterLevel(s.scenario, s.phase === "running" ? (Date.now() - s.startAt) / 1000 : Infinity);
    m.visible = level > 0;
    m.position.y = level;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[W / 2, 0, H / 2]} visible={false}>
      <planeGeometry args={[W + 80, H + 80]} />
      <meshStandardMaterial color="#2f6f9f" transparent opacity={0.72} roughness={0.2} />
    </mesh>
  );
}

function HazardOverlay({ hazards }: { hazards: Set<number> }) {
  const items = useMemo(() => [...hazards].map((i): Placed => ({ x: i % W, z: Math.floor(i / W) })), [hazards]);
  if (!items.length) return null;
  return (
    <Instanced items={items} y={0.06}>
      <boxGeometry args={[0.96, 0.04, 0.96]} />
      <meshBasicMaterial color="#e0473c" transparent opacity={0.45} />
    </Instanced>
  );
}

function Route() {
  const route = useDrill((s) => (s.showRoute ? s.route : null));
  if (!route || route.length < 2) return null;
  return (
    <Line
      points={route.map(([x, z]) => [x + 0.5, tileElevation(x, z) + 0.2, z + 0.5] as [number, number, number])}
      color="#ff8a3d"
      lineWidth={5}
      dashed
      dashSize={0.6}
      gapSize={0.35}
    />
  );
}

function Sun({ position = [W / 2 + 30, 22, H / 2 - 18] }: { position?: [number, number, number] }) {
  const ref = useRef<DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const light = ref.current!;
    light.target.position.set(W / 2, 0, H / 2);
    scene.add(light.target);
    return () => void scene.remove(light.target);
  }, [scene]);
  return (
    <directionalLight
      ref={ref}
      position={position}
      color="#ffc48a"
      intensity={2.2}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-32}
      shadow-camera-right={32}
      shadow-camera-top={32}
      shadow-camera-bottom={-32}
    />
  );
}

/** Dawn sky, haze and light shared by the game and the landing scene. */
export function Backdrop({
  sky = [100, 6, -60],
  light,
  fog = [45, 140],
}: {
  sky?: [number, number, number];
  light?: [number, number, number];
  fog?: [number, number];
}) {
  return (
    <>
      <Sky sunPosition={sky} turbidity={7} rayleigh={2.2} mieCoefficient={0.008} />
      <fog attach="fog" args={["#d9b08c", ...fog]} />
      <hemisphereLight args={["#ffe2c2", "#22324f", 0.9]} />
      <Sun position={light} />
    </>
  );
}

export default function World({
  me,
  peers,
  school,
}: {
  me: { name: string; look: Look };
  peers: Peer[];
  school: School | null;
}) {
  const scenario = useDrill((s) => s.scenario);
  const showRisk = useDrill((s) => s.showRisk);
  const { risks, hazards, goals } = useMemo(() => predict(scenario, school), [scenario, school]);

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 45, near: 0.1, far: 400 }} aria-label="Kampus sekolah">
      <Backdrop />
      <Terrain />
      <Coast />
      <Props />
      <Buildings risks={risks} showRisk={showRisk} />
      <AssemblyPoints safe={goals} />
      <Warden />
      {showRisk && <HazardOverlay hazards={hazards} />}
      <Route />
      <Water />
      <Player look={me.look} name={me.name} />
      <RemotePlayers peers={peers} />
    </Canvas>
  );
}

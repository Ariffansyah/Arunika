"use client";

import { Line, Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  Color,
  Object3D,
  PlaneGeometry,
  type DirectionalLight,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshStandardMaterial,
  type Vector3,
} from "three";
import {
  ASSEMBLY,
  ASSEMBLY_NAMES,
  BUILDINGS,
  GRID,
  H,
  SITE_D,
  SITE_W,
  TILE,
  W,
  WARDEN,
  buildingRects,
  elevationAt,
  findTiles,
  surfaceAt,
  tileAt,
  tileCenter,
  tileElevation,
  type Tile,
} from "@/lib/campus";
import { QUAKE_SHAKE_S, waterLevel } from "@/lib/sim";
import type { School } from "@/lib/supabase";
import type { Look } from "@/components/Character";
import Html from "@/components/Html";
import Model, { M } from "@/components/Model";
import Avatar from "./Avatar";
import { Beacons, Classmates, FloodDebris, QuakeDebris } from "./Effects";
import { getState, openChat, player, predict, useDrill } from "./drillStore";
import Player from "./Player";
import Scenery from "./Scenery";
import RemotePlayers from "./RemotePlayers";
import type { Peer } from "./useRoom";

const GROUND: Record<string, string> = { ".": "#a3a081", h: "#4f8a4a", g: "#5f9b4c", A: "#4f8a4a", B: "#5f9b4c" };
const SURFACE = { paving: "#cfc6b1", court: "#3f6f9e" };

export function Terrain() {
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(SITE_W, SITE_D, W * 2, H * 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      // Same as rotating the plane flat, but with the height and tile colour baked in.
      const x = pos.getX(i) + SITE_W / 2;
      const z = -pos.getY(i) + SITE_D / 2;
      pos.setXYZ(i, x, elevationAt(x, z), z);
      const tx = Math.min(W - 1, Math.floor(x / TILE));
      const tz = Math.min(H - 1, Math.floor(z / TILE));
      const surface = surfaceAt(tx, tz);
      c.set(surface ? SURFACE[surface] : (GROUND[tileAt(tx, tz)] ?? GROUND["."]));
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
      <mesh rotation-x={-Math.PI / 2} position={[SITE_W / 2, 0.02, SITE_D + 10.5]} receiveShadow>
        <planeGeometry args={[SITE_W + 360, 21]} />
        <meshStandardMaterial color="#d9c38e" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[SITE_W / 2, -0.1, SITE_D + 111]}>
        <planeGeometry args={[SITE_W + 480, 180]} />
        <meshStandardMaterial color="#1e4f7a" roughness={0.3} />
      </mesh>
    </>
  );
}

// Centre and size in metres; children are unit-sized and scaled per item.
type Placed = { x: number; z: number; sx?: number; sy?: number; sz?: number; color?: string };

function Instanced({ items, y, children }: { items: Placed[]; y: number; children: React.ReactNode }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new Object3D();
    const c = new Color();
    items.forEach((it, i) => {
      o.position.set(it.x, elevationAt(it.x, it.z) + y * (it.sy ?? 1), it.z);
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

// tileAt pads the outside of the map with fence, so neighbours are read from GRID directly.
const isFence = (x: number, z: number) => GRID[z]?.[x] === "=";
const FENCE_H = 1.8;
const FENCE: Placed[] = findTiles("=").flatMap(([tx, tz]) => {
  const along = isFence(tx - 1, tz) || isFence(tx + 1, tz);
  const across = isFence(tx, tz - 1) || isFence(tx, tz + 1);
  const [x, z] = tileCenter(tx, tz);
  return [
    ...(along ? [{ x, z, sx: TILE, sy: FENCE_H, sz: 0.25 }] : []),
    ...(across || !along ? [{ x, z, sx: 0.25, sy: FENCE_H, sz: TILE }] : []),
  ];
});

const TREES = findTiles("T");

function Tree({ x, z, i, fade }: { x: number; z: number; i: number; fade: boolean }) {
  const ref = useRef<Group>(null);
  const opacity = useRef(1);
  const camera = useThree((s) => s.camera);
  const height = 7 + ((x * 37 + z * 17) % 10) / 4.5;
  const [cx, cz] = tileCenter(x, z);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !fade) return;
    const target = hides(camera.position, tileElevation(x, z) + height, cx - 2.1, cz - 2.1, cx + 2.1, cz + 2.1) ? 0.3 : 1;
    if (Math.abs(opacity.current - target) < 0.01) return;
    opacity.current += (target - opacity.current) * (1 - Math.exp(-dt * 10));
    fadeTo(g, opacity.current);
  });
  return (
    <group ref={ref}>
      <Model
        src={M.trees[i % M.trees.length]}
        fit={{ height }}
        ownMaterials={fade}
        position={[cx, tileElevation(x, z), cz]}
        rotation-y={(x * 13 + z * 7) % 6}
      />
    </group>
  );
}

export function Props({ fade = false }: { fade?: boolean }) {
  return (
    <>
      <Instanced items={FENCE} y={0.5}>
        <boxGeometry />
        <meshStandardMaterial color="#efe6d4" />
      </Instanced>
      <Suspense fallback={null}>
        {TREES.map(([x, z], i) => (
          <Tree key={`${x}-${z}`} x={x} z={z} i={i} fade={fade} />
        ))}
      </Suspense>
    </>
  );
}

const riskColor = (r: number) => new Color("#efe3c8").lerp(new Color("#e0473c"), r / 100);

// Liang-Barsky clip of the camera-to-player sight line against a footprint; returns where it enters, or null.
function sightEnters(cam: Vector3, x0: number, z0: number, x1: number, z1: number) {
  const dx = player.x - cam.x;
  const dz = player.z - cam.z;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, cam.x - x0],
    [dx, x1 - cam.x],
    [-dz, cam.z - z0],
    [dz, z1 - cam.z],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return t0 < 0.95 ? t0 : null;
}

function hides(cam: Vector3, top: number, x0: number, z0: number, x1: number, z1: number) {
  const t = sightEnters(cam, x0, z0, x1, z1);
  if (t === null) return false;
  const eye = elevationAt(player.x, player.z) + 1.4;
  return cam.y + (eye - cam.y) * t < top;
}

function fadeTo(g: Group, opacity: number) {
  const see = opacity < 0.99;
  g.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (!m || Array.isArray(m)) return;
    // Opaque shaders are compiled to ignore alpha, so switching modes needs a recompile.
    if (m.transparent !== see) {
      m.transparent = see;
      m.needsUpdate = true;
    }
    m.opacity = opacity;
  });
}

const RECTS = buildingRects();

const STOREY = 4;
const CORRIDOR = 2.5;

function SchoolBuilding({
  id,
  risk,
  showRisk,
  fade,
}: {
  id: string;
  risk: number;
  showRisk: boolean;
  fade: boolean;
}) {
  const ref = useRef<Group>(null);
  const opacity = useRef(1);
  const r = RECTS[id];
  const b = BUILDINGS[id];
  const w = (r.x1 - r.x0 + 1) * TILE;
  const d = (r.z1 - r.z0 + 1) * TILE;
  const x0 = r.x0 * TILE;
  const z0 = r.z0 * TILE;
  const h = b.floors * STOREY;
  const base = Math.min(tileElevation(r.x0, r.z0), tileElevation(r.x1, r.z1)) - 0.1;
  // Corridor on the south face, the side the camera sees.
  const core = d - CORRIDOR;
  const front = d / 2 - CORRIDOR / 2;
  const bays = Math.max(2, Math.round(w / 4.5));

  const camera = useThree((s) => s.camera);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const s = getState();
    const t = (Date.now() - s.startAt) / 1000;
    const shaking = s.phase === "running" && s.scenario.kind === "gempa" && t >= 0 && t < QUAKE_SHAKE_S;
    // Weaker blocks visibly sway more: the risk model, shown rather than told.
    const sway = shaking ? (0.004 + (risk / 100) * 0.03) * (s.scenario.intensity - 4) * 0.5 : 0;
    g.rotation.z = Math.sin(t * 17 + r.x0) * sway;
    g.rotation.x = Math.cos(t * 13 + r.z0) * sway * 0.6;
    if (!fade) return;
    const target = hides(camera.position, base + h + 2.4, x0 - 1.5, z0 - 1.5, x0 + w + 1.5, z0 + d + 1.5) ? 0.28 : 1;
    if (Math.abs(opacity.current - target) < 0.01) return;
    opacity.current += (target - opacity.current) * (1 - Math.exp(-dt * 10));
    fadeTo(g, opacity.current);
  });

  return (
    <group ref={ref} position={[x0 + w / 2, base, z0 + d / 2]}>
      <mesh position={[0, h / 2, -CORRIDOR / 2]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.1, h, core]} />
        <meshStandardMaterial color={showRisk ? riskColor(risk) : "#efe3c8"} />
      </mesh>
      <mesh position={[0, 0.25, -CORRIDOR / 2]}>
        <boxGeometry args={[w - 0.05, 0.5, core + 0.05]} />
        <meshStandardMaterial color="#9a8467" />
      </mesh>
      {b.floors > 1 && (
        <mesh position={[0, STOREY, front]} castShadow receiveShadow>
          <boxGeometry args={[w - 0.1, 0.2, CORRIDOR]} />
          <meshStandardMaterial color="#d9cdb4" />
        </mesh>
      )}
      {Array.from({ length: b.floors }, (_, f) =>
        Array.from({ length: bays }, (_, i) => {
          const x = -w / 2 + (w / bays) * (i + 0.5);
          const door = f === 0 && i % 3 === 1;
          return (
            <group key={`${f}-${i}`} position={[x, f * STOREY, core / 2 - CORRIDOR / 2 + 0.03]}>
              <mesh position={[0, door ? 1.05 : 1.5, 0]}>
                <boxGeometry args={[door ? 1 : 1.5, door ? 2.1 : 1.2, 0.05]} />
                <meshStandardMaterial color={door ? "#7a4a2b" : "#2b4a6b"} />
              </mesh>
              {!door && (
                <mesh position={[0, 1.5, 0.01]}>
                  <boxGeometry args={[0.06, 1.2, 0.06]} />
                  <meshStandardMaterial color="#e9f1f5" />
                </mesh>
              )}
            </group>
          );
        }),
      )}
      <mesh position={[0, 0.1, front]} receiveShadow>
        <boxGeometry args={[w, 0.2, CORRIDOR]} />
        <meshStandardMaterial color="#cdbfa6" />
      </mesh>
      {Array.from({ length: bays + 1 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + 0.15 + ((w - 0.3) / bays) * i, h / 2, d / 2 - 0.15]} castShadow>
          <boxGeometry args={[0.25, h, 0.25]} />
          <meshStandardMaterial color="#f6f2ea" />
        </mesh>
      ))}
      {/* A 4-sided cone turned 45° is a hip roof; the outer scale stretches it to the footprint. */}
      <group position={[0, h + 1.1, 0.2]} scale={[(w + 1.6) / Math.SQRT2, 1, (d + 2) / Math.SQRT2]}>
        <mesh rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[1, 2.2, 4]} />
          <meshStandardMaterial color="#b4532a" flatShading />
        </mesh>
      </group>
      {showRisk && (
        <Html position={[0, h + 3.4, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-malam/90 px-2 py-1 text-center text-xs text-pasir">
            <div className="font-semibold">{b.name}</div>
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
  return Object.keys(RECTS).map((id) => <SchoolBuilding key={id} id={id} risk={risks[id] ?? 0} showRisk={showRisk} fade={fade} />);
}

function AssemblyPoints({ safe }: { safe: Tile[] }) {
  const phase = useDrill((s) => s.phase);
  return ASSEMBLY.map(([x, z]) => {
    const ok = safe.some(([sx, sz]) => sx === x && sz === z);
    const [cx, cz] = tileCenter(x, z);
    return (
      <group key={`${x}-${z}`} position={[cx, tileElevation(x, z), cz]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
          <ringGeometry args={[3.9, 4.8, 48]} />
          <meshStandardMaterial color={phase !== "idle" && !ok ? "#e0473c" : "#34c47c"} />
        </mesh>
        <Html position={[0, 3.3, -3.6]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
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
  const near = useDrill((s) => s.nearWarden && !s.chatOpen && s.phase !== "running");
  const ref = useRef<Group>(null);
  const [x, z] = tileCenter(...WARDEN);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const target = getState().nearWarden ? Math.atan2(player.x - x, player.z - z) : Math.PI / 4;
    const d = Math.atan2(Math.sin(target - g.rotation.y), Math.cos(target - g.rotation.y));
    g.rotation.y += d * (1 - Math.exp(-dt * 7));
  });
  return (
    <group position={[x, elevationAt(x, z), z]}>
      <group ref={ref} rotation-y={Math.PI / 4}>
        <Avatar look="worker" name="Petugas Keselamatan" height={1.7} anim={() => (getState().chatOpen ? "emote-yes" : "idle")} />
      </group>
      {near && (
        <Html position={[0, 2.5, 0]} center zIndexRange={[30, 0]}>
          <button
            type="button"
            onClick={openChat}
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
  const baseRef = useRef<Float32Array | null>(null);
  useFrame(() => {
    const s = getState();
    const m = ref.current;
    if (!m) return;
    const level = s.phase === "idle" ? 0 : waterLevel(s.scenario, s.phase === "running" ? (Date.now() - s.startAt) / 1000 : Infinity);
    m.visible = level > 0;
    if (!m.visible) return;
    m.position.y = level;
    const t = Date.now() / 1000;
    const pos = m.geometry.attributes.position;
    baseRef.current ??= Float32Array.from(pos.array);
    const b = baseRef.current;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.sin(b[i * 3] * 0.17 + t * 1.4) * 0.06 + Math.sin(b[i * 3 + 1] * 0.23 - t * 1.1) * 0.05);
    }
    pos.needsUpdate = true;
    m.geometry.computeVertexNormals();
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[SITE_W / 2, 0, SITE_D / 2]} visible={false}>
      <planeGeometry args={[SITE_W + 240, SITE_D + 240, 80, 64]} />
      <meshPhongMaterial color="#3a8fc6" specular="#ffe2c2" shininess={70} transparent opacity={0.72} />
    </mesh>
  );
}

function HazardOverlay({ hazards }: { hazards: Set<number> }) {
  const items = useMemo(
    () =>
      [...hazards].map((i): Placed => {
        const [x, z] = tileCenter(i % W, Math.floor(i / W));
        return { x, z, sx: TILE * 0.96, sy: 0.05, sz: TILE * 0.96 };
      }),
    [hazards],
  );
  if (!items.length) return null;
  return (
    <Instanced items={items} y={1.6}>
      <boxGeometry />
      <meshBasicMaterial color="#e0473c" transparent opacity={0.45} />
    </Instanced>
  );
}

function Route() {
  const route = useDrill((s) => (s.showRoute ? s.route : null));
  if (!route || route.length < 2) return null;
  return (
    <Line
      points={route.map(([x, z]) => {
        const [cx, cz] = tileCenter(x, z);
        return [cx, tileElevation(x, z) + 0.3, cz] as [number, number, number];
      })}
      color="#ff8a3d"
      lineWidth={5}
      dashed
      dashSize={1.6}
      gapSize={1}
    />
  );
}

function Sun({
  position = [SITE_W / 2 + 90, 66, SITE_D / 2 - 54],
  follow = false,
}: {
  position?: [number, number, number];
  follow?: boolean;
}) {
  const ref = useRef<DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const light = ref.current!;
    light.target.position.set(SITE_W / 2, 0, SITE_D / 2);
    scene.add(light.target);
    return () => void scene.remove(light.target);
  }, [scene]);
  // Following the player keeps one shadow map sharp across the whole site; whole metres stop the edges shimmering.
  useFrame(() => {
    const light = ref.current;
    if (!follow || !light) return;
    const x = Math.round(player.x);
    const z = Math.round(player.z);
    light.target.position.set(x, 0, z);
    light.position.set(x + position[0] - SITE_W / 2, position[1], z + position[2] - SITE_D / 2);
  });
  const half = follow ? 40 : SITE_W * 0.65;
  return (
    <directionalLight
      ref={ref}
      position={position}
      color="#ffc48a"
      intensity={2.2}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-half}
      shadow-camera-right={half}
      shadow-camera-top={half}
      shadow-camera-bottom={-half}
      shadow-camera-far={400}
    />
  );
}

export function Backdrop({
  sky = [100, 6, -60],
  light,
  fog = [120, 420],
  follow = false,
}: {
  sky?: [number, number, number];
  light?: [number, number, number];
  fog?: [number, number];
  follow?: boolean;
}) {
  return (
    <>
      <Sky sunPosition={sky} turbidity={7} rayleigh={2.2} mieCoefficient={0.008} />
      <fog attach="fog" args={["#d9b08c", ...fog]} />
      <hemisphereLight args={["#ffe2c2", "#22324f", 0.9]} />
      <Sun position={light} follow={follow} />
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
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 1500 }}
      style={{ touchAction: "none" }}
      aria-label="Kampus sekolah"
    >
      <Backdrop follow />
      <Scenery />
      <Terrain />
      <Coast />
      <Props fade />
      <Buildings risks={risks} showRisk={showRisk} fade />
      <Classmates />
      <QuakeDebris />
      <FloodDebris />
      <Beacons />
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

"use client";

import { Line, Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, Color, Object3D, PlaneGeometry, type DirectionalLight, type Group, type InstancedMesh, type Mesh } from "three";
import {
  ASSEMBLY,
  ASSEMBLY_NAMES,
  H,
  SITE_D,
  SITE_W,
  TILE,
  W,
  elevationAt,
  findTiles,
  surfaceAt,
  tileAt,
  tileCenter,
  tileElevation,
  type Tile,
} from "@/lib/campus";
import { FENCE, FENCE_H } from "@/lib/nav";
import { waterLevel } from "@/lib/sim";
import type { School } from "@/lib/supabase";
import type { Look } from "@/components/Character";
import Html from "@/components/Html";
import Model, { M } from "@/components/Model";
import Avatar from "./Avatar";
import { Buildings } from "./Building";
import { Beacons, Classmates, FloodDebris, QuakeDebris } from "./Effects";
import { fadeTo, hides } from "./fade";
import { getState, player, predict, useDrill } from "./drillStore";
import { interact, wardenSpot } from "./interact";
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

const FENCE_ITEMS: Placed[] = FENCE.map((f) => ({ ...f, sy: FENCE_H }));

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
      <Instanced items={FENCE_ITEMS} y={0.5}>
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
  const outer = useRef<Group>(null);
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    const o = outer.current;
    if (!g || !o) return;
    const [x, z] = wardenSpot();
    o.position.set(x, elevationAt(x, z), z);
    const id = getState().prompt?.id;
    const target = id === "warden" || id === "lapor" ? Math.atan2(player.x - x, player.z - z) : Math.PI / 4;
    const d = Math.atan2(Math.sin(target - g.rotation.y), Math.cos(target - g.rotation.y));
    g.rotation.y += d * (1 - Math.exp(-dt * 7));
  });
  return (
    <group ref={outer}>
      <group ref={ref} rotation-y={Math.PI / 4}>
        <Avatar look="worker" name="Petugas Keselamatan" height={1.7} anim={() => (getState().chatOpen ? "emote-yes" : "idle")} />
      </group>
    </group>
  );
}

// The action E would take, next to the thing it acts on; clicking it does the same.
function PromptLabel() {
  const prompt = useDrill((s) => s.prompt);
  if (!prompt) return null;
  return (
    <Html position={[prompt.x, prompt.y, prompt.z]} center zIndexRange={[30, 0]}>
      <button
        type="button"
        onClick={interact}
        className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md bg-pasir px-3 text-sm font-semibold text-malam hover:bg-white active:translate-y-px"
      >
        <kbd className="rounded border border-malam/30 px-1.5 text-xs">E</kbd>
        {prompt.label}
      </button>
    </Html>
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
      points={route.map(([x, y, z]) => [x, y + 0.25, z] as [number, number, number])}
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
      <PromptLabel />
      {showRisk && <HazardOverlay hazards={hazards} />}
      <Route />
      <Water />
      <Player look={me.look} name={me.name} />
      <RemotePlayers peers={peers} />
    </Canvas>
  );
}

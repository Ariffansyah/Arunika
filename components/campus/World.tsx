"use client";

import { Line, Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import {
  BackSide,
  CanvasTexture,
  Color,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  type DirectionalLight,
  type Fog,
  type Group,
  type InstancedMesh,
  type Mesh,
} from "three";
import {
  ASSEMBLY,
  ASSEMBLY_NAMES,
  H,
  MAP,
  SITE_D,
  SITE_W,
  TILE,
  W,
  buildingRects,
  elevationAt,
  findTiles,
  surfaceAt,
  tileAt,
  tileCenter,
  tileElevation,
  type Tile,
} from "@/lib/campus";
import { FENCE, FENCE_H, LOW_FENCE, LOW_FENCE_H } from "@/lib/nav";
import { random, vortexAt, waterLevel } from "@/lib/sim";
import type { School } from "@/lib/supabase";
import type { Look } from "@/components/Character";
import Html from "@/components/Html";
import Model, { M } from "@/components/Model";
import Avatar from "./Avatar";
import { Buildings } from "./Building";
import { Beacons, Classmates, DoorRubble, FloodDebris, GlassShards, Landslide, QuakeDebris, Rain, Vortex } from "./Effects";
import { fadeTo, hides } from "./fade";
import { drillTime, getState, player, predict, run, useDrill } from "./drillStore";
import { interact, wardenSpot } from "./interact";
import Player from "./Player";
import Scenery from "./Scenery";
import { LOOK } from "./Horizon";
import RemotePlayers from "./RemotePlayers";
import type { Peer } from "./useRoom";

// Texture pixels per metre of ground.
const PX = 16;
// Hue, saturation and lightness of the grass on each kind of tile.
const GRASS: Record<string, [number, number, number]> = { h: [96, 34, 32], A: [96, 34, 32], g: [100, 42, 40], B: [100, 42, 40] };
const LAWN: [number, number, number] = [84, 32, 44];

// The site painted once: worn lawn, a mown field, paving blocks with curbs, concrete round the buildings, a dirt track.
function paintGround() {
  const canvas = document.createElement("canvas");
  canvas.width = SITE_W * PX;
  canvas.height = SITE_D * PX;
  const g = canvas.getContext("2d")!;
  const rnd = random(3);
  const px = (m: number) => m * PX;
  const hsl = ([h, s, l]: [number, number, number], dl = 0) => `hsl(${h} ${s}% ${l + dl}%)`;
  const grass = (x: number, z: number) => GRASS[tileAt(x, z)] ?? LAWN;
  const surfaceOf = (x: number, z: number) => (x < 0 || z < 0 || x >= W || z >= H ? null : surfaceAt(x, z));

  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      g.fillStyle = hsl(grass(x, z));
      g.fillRect(px(x * TILE), px(z * TILE), px(TILE), px(TILE));
    }
  }
  // Blades and worn patches: thousands of small dabs, lighter and darker than the base.
  for (let i = 0; i < 90000; i++) {
    const x = rnd() * SITE_W;
    const z = rnd() * SITE_D;
    g.fillStyle = hsl(grass(Math.floor(x / TILE), Math.floor(z / TILE)), (rnd() - 0.5) * 14);
    g.fillRect(px(x), px(z), 1 + rnd() * 3, 1 + rnd() * 3);
  }
  for (let i = 0; i < 260; i++) {
    const x = rnd() * SITE_W;
    const z = rnd() * SITE_D;
    if (tileAt(Math.floor(x / TILE), Math.floor(z / TILE)) !== ".") continue;
    g.fillStyle = `hsl(42 ${22 + rnd() * 10}% ${48 + rnd() * 8}% / 0.35)`;
    g.beginPath();
    g.ellipse(px(x), px(z), px(0.6 + rnd() * 1.6), px(0.4 + rnd()), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // Mowing stripes across the field, one per tile.
  for (const [x, z] of findTiles("gB")) {
    g.fillStyle = x % 2 ? "rgb(255 255 255 / 0.06)" : "rgb(0 0 0 / 0.05)";
    g.fillRect(px(x * TILE), px(z * TILE), px(TILE), px(TILE));
  }
  // Concrete aprons and a drain round every building.
  for (const r of Object.values(buildingRects())) {
    const [x0, z0, x1, z1] = [r.x0 * TILE - 1.2, r.z0 * TILE - 1.2, (r.x1 + 1) * TILE + 1.2, (r.z1 + 1) * TILE + 1.2];
    g.fillStyle = "#b9b2a4";
    g.fillRect(px(x0), px(z0), px(x1 - x0), px(z1 - z0));
    g.strokeStyle = "#7d776c";
    g.lineWidth = px(0.12);
    g.strokeRect(px(x0 + 0.1), px(z0 + 0.1), px(x1 - x0 - 0.2), px(z1 - z0 - 0.2));
  }
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const surface = surfaceAt(x, z);
      const [mx, mz] = [x * TILE, z * TILE];
      if (surface === "paving") {
        // Running-bond paving blocks, 50 by 25 cm, each a slightly different tone.
        g.fillStyle = "#8f887b";
        g.fillRect(px(mx), px(mz), px(TILE), px(TILE));
        for (let row = 0; row < TILE / 0.25; row++) {
          for (let k = -1; k < TILE / 0.5; k++) {
            const bx = mx + k * 0.5 + (row % 2) * 0.25;
            const x0 = Math.max(mx, bx);
            const x1 = Math.min(mx + TILE, bx + 0.5);
            if (x1 <= x0) continue;
            g.fillStyle = `hsl(36 ${8 + rnd() * 6}% ${66 + rnd() * 8}%)`;
            g.fillRect(px(x0) + 1, px(mz + row * 0.25) + 1, px(x1 - x0) - 1, px(0.25) - 1);
          }
        }
      } else if (surface === "court") {
        g.fillStyle = "#3d6c99";
        g.fillRect(px(mx), px(mz), px(TILE), px(TILE));
      } else if (surface === "trail") {
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `hsl(30 ${30 + rnd() * 10}% ${34 + rnd() * 8}%)`;
          g.beginPath();
          g.arc(px(mx + 0.4 + rnd() * 2.2), px(mz + 0.4 + rnd() * 2.2), px(0.35 + rnd() * 0.5), 0, Math.PI * 2);
          g.fill();
        }
      }
      if (surface !== "paving") continue;
      // A curb wherever paving meets lawn.
      g.fillStyle = "#ddd7cb";
      const curb = px(0.15);
      if (!surfaceOf(x, z - 1)) g.fillRect(px(mx), px(mz), px(TILE), curb);
      if (!surfaceOf(x, z + 1)) g.fillRect(px(mx), px(mz + TILE) - curb, px(TILE), curb);
      if (!surfaceOf(x - 1, z)) g.fillRect(px(mx), px(mz), curb, px(TILE));
      if (!surfaceOf(x + 1, z)) g.fillRect(px(mx + TILE) - curb, px(mz), curb, px(TILE));
    }
  }
  // Bare soil round each tree trunk.
  for (const [x, z] of TREES) {
    const [cx, cz] = tileCenter(x, z);
    g.fillStyle = "#6e5038";
    g.beginPath();
    g.arc(px(cx), px(cz), px(1.2), 0, Math.PI * 2);
    g.fill();
  }
  return canvas;
}

export function Terrain() {
  const gl = useThree((s) => s.gl);
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(SITE_W, SITE_D, W * 2, H * 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // Same as rotating the plane flat, but with the height baked in; the UVs still span the whole site.
      const x = pos.getX(i) + SITE_W / 2;
      const z = -pos.getY(i) + SITE_D / 2;
      pos.setXYZ(i, x, elevationAt(x, z), z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);
  const map = useMemo(() => {
    const texture = new CanvasTexture(paintGround());
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    return texture;
  }, [gl]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial map={map} roughness={0.95} />
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

// Railings in metre lengths, so posts and rails follow a slope instead of cutting into it.
const RAIL_PIECES = LOW_FENCE.flatMap((f) => {
  const long = Math.max(f.sx, f.sz);
  const n = Math.max(1, Math.round(long));
  const along = f.sx > f.sz;
  return Array.from({ length: n }, (_, k) => {
    const off = -long / 2 + (long * (k + 0.5)) / n;
    return { x: f.x + (along ? off : 0), z: f.z + (along ? 0 : off), sx: along ? long / n : 0.05, sz: along ? 0.05 : long / n };
  });
});
const RAIL_TOP: Placed[] = RAIL_PIECES.map((p) => ({ ...p, sy: 0.06 }));
const RAIL_MID: Placed[] = RAIL_PIECES.map((p) => ({ ...p, sy: 0.05 }));
const RAIL_POSTS: Placed[] = RAIL_PIECES.map((p) => ({
  x: p.x - (p.sx > p.sz ? p.sx / 2 : 0),
  z: p.z - (p.sz > p.sx ? p.sz / 2 : 0),
  sx: 0.07,
  sy: LOW_FENCE_H,
  sz: 0.07,
}));

const TREES = findTiles("T");

// Shade trees on the coast with the odd palm, pines among them in the mountains, shade trees in the city.
const treeKind = (x: number, z: number, i: number) => {
  const onHill = [-1, 0, 1].some((d) => tileAt(x + d, z) === "h" || tileAt(x, z + d) === "h");
  if (MAP.id === "pegunungan" && (onHill || i % 3 === 0)) return { src: M.pines[i % M.pines.length], height: 10 + (i % 4) };
  if (MAP.id === "pesisir" && i % 4 === 3 && !onHill) return { src: M.palms[i % M.palms.length], height: 9 + (i % 3) };
  return { src: M.trees[i % M.trees.length], height: 7 + ((x * 37 + z * 17) % 10) / 4.5 };
};

function Tree({ x, z, i, fade }: { x: number; z: number; i: number; fade: boolean }) {
  const ref = useRef<Group>(null);
  const opacity = useRef(1);
  const camera = useThree((s) => s.camera);
  const { src, height } = treeKind(x, z, i);
  const [cx, cz] = tileCenter(x, z);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    // Trees lean in a storm and thrash as the whirlwind passes close.
    const s = getState();
    const storm = s.phase !== "idle" && s.scenario.kind === "angin";
    const v = storm ? vortexAt(run.timeline, drillTime()) : null;
    // A breath of wind on a calm day, so the trees are never frozen.
    const gust = storm ? 0.05 + (v ? 0.35 * Math.exp(-Math.hypot(v[0] - cx, v[1] - cz) / 25) : 0) : 0.012;
    const now = Date.now() / 1000;
    g.rotation.z = gust * (0.6 + 0.4 * Math.sin(now * 3.1 + i));
    g.rotation.x = gust * 0.4 * Math.sin(now * 2.3 + i * 1.7);
    if (!fade) return;
    const target = hides(camera.position, tileElevation(x, z) + height, cx - 2.1, cz - 2.1, cx + 2.1, cz + 2.1) ? 0.3 : 1;
    if (Math.abs(opacity.current - target) < 0.01) return;
    opacity.current += (target - opacity.current) * (1 - Math.exp(-dt * 10));
    fadeTo(g, opacity.current);
  });
  return (
    <group ref={ref} position={[cx, tileElevation(x, z), cz]}>
      <Model src={src} fit={{ height }} ownMaterials={fade} rotation-y={(x * 13 + z * 7) % 6} />
    </group>
  );
}

const STORM_SKY = new Color("#5b6670");

// Whirlwinds and landslides come with storms: a low grey sky over the sunset, closer fog, a weak sun.
function Storm() {
  const ref = useRef<Mesh>(null);
  const clear = useRef<{ color: Color; near: number; far: number } | null>(null);
  useFrame(({ scene, camera }) => {
    const s = getState();
    const on = s.phase !== "idle" && (s.scenario.kind === "angin" || s.scenario.kind === "longsor");
    const fog = scene.fog as Fog | null;
    if (fog) {
      clear.current ??= { color: fog.color.clone(), near: fog.near, far: fog.far };
      fog.color.copy(on ? STORM_SKY : clear.current.color);
      fog.near = on ? 30 : clear.current.near;
      fog.far = on ? 240 : clear.current.far;
    }
    const m = ref.current;
    if (!m) return;
    m.visible = on;
    m.position.copy(camera.position);
  });
  // Drawn after the rest of the scene so it covers only the sky, which writes no depth.
  return (
    <mesh ref={ref} visible={false} renderOrder={1}>
      <sphereGeometry args={[600, 24, 16]} />
      <meshBasicMaterial color={STORM_SKY} side={BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

export function Props({ fade = false }: { fade?: boolean }) {
  return (
    <>
      <Instanced items={FENCE_ITEMS} y={0.5}>
        <boxGeometry />
        <meshStandardMaterial color="#efe6d4" />
      </Instanced>
      <Instanced items={RAIL_POSTS} y={0.5}>
        <boxGeometry />
        <meshStandardMaterial color="#2d6a4f" />
      </Instanced>
      <Instanced items={RAIL_TOP} y={(LOW_FENCE_H - 0.03) / 0.06}>
        <boxGeometry />
        <meshStandardMaterial color="#2d6a4f" />
      </Instanced>
      <Instanced items={RAIL_MID} y={0.45 / 0.05}>
        <boxGeometry />
        <meshStandardMaterial color="#2d6a4f" />
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
        <Avatar look="petugas" name="Petugas Keselamatan" height={1.7} anim={() => (getState().chatOpen ? "talk" : "idle")} />
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

// Shown over a low obstacle while a jump over it is possible.
function VaultLabel() {
  const at = useDrill((s) => s.vaultAt);
  if (!at) return null;
  return (
    <Html position={[at.x, at.y, at.z]} center zIndexRange={[25, 0]} style={{ pointerEvents: "none" }}>
      <span className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-pasir/90 px-2 py-1 text-xs font-semibold text-malam">
        <kbd className="rounded border border-malam/30 px-1 pointer-coarse:hidden">Spasi</kbd>
        Lompati
      </span>
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
    if (!light) return;
    const s = getState();
    light.intensity = s.phase !== "idle" && (s.scenario.kind === "angin" || s.scenario.kind === "longsor") ? 0.7 : 2.2;
    if (!follow) return;
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
  fogColor = "#d9b08c",
  follow = false,
}: {
  sky?: [number, number, number];
  light?: [number, number, number];
  fog?: [number, number];
  fogColor?: string;
  follow?: boolean;
}) {
  return (
    <>
      <Sky sunPosition={sky} turbidity={7} rayleigh={2.2} mieCoefficient={0.008} />
      <fog attach="fog" args={[fogColor, ...fog]} />
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
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 1500 }}
      style={{ touchAction: "none" }}
      aria-label="Kampus sekolah"
    >
      <Backdrop {...LOOK[MAP.id]} follow />
      <Storm />
      <Scenery />
      <Terrain />
      {MAP.id === "pesisir" && <Coast />}
      <Props fade />
      <Buildings risks={risks} showRisk={showRisk} fade />
      <Classmates />
      <QuakeDebris />
      <GlassShards />
      <DoorRubble />
      <FloodDebris />
      <Landslide />
      <Vortex />
      <Rain />
      <Beacons />
      <AssemblyPoints safe={goals} />
      <Warden />
      <PromptLabel />
      <VaultLabel />
      {showRisk && <HazardOverlay hazards={hazards} />}
      <Route />
      <Water />
      <Player look={me.look} name={me.name} />
      <RemotePlayers peers={peers} />
    </Canvas>
  );
}

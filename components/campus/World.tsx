"use client";

import { Html, Line, Sky } from "@react-three/drei";
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
import Model, { M } from "@/components/Model";
import Avatar from "./Avatar";
import { getState, openChat, player, predict, useDrill } from "./drillStore";
import Player from "./Player";
import Scenery from "./Scenery";
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
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0.02, H + 3.5]} receiveShadow>
        <planeGeometry args={[W + 120, 7]} />
        <meshStandardMaterial color="#d9c38e" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, -0.1, H + 37]}>
        <planeGeometry args={[W + 160, 60]} />
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

const TREES = findTiles("T");

export function Props() {
  return (
    <>
      <Instanced items={FENCE} y={0.42}>
        <boxGeometry args={[1, 0.85, 1]} />
        <meshStandardMaterial color="#efe6d4" />
      </Instanced>
      <Suspense fallback={null}>
        {TREES.map(([x, z], i) => (
          <Model
            key={`${x}-${z}`}
            src={M.trees[i % M.trees.length]}
            fit={{ height: 2.3 + ((x * 37 + z * 17) % 10) / 14 }}
            position={[x + 0.5, tileElevation(x, z), z + 0.5]}
            rotation-y={(x * 13 + z * 7) % 6}
          />
        ))}
      </Suspense>
    </>
  );
}

const riskColor = (r: number) => new Color("#efe3c8").lerp(new Color("#e0473c"), r / 100);

const RECTS = buildingRects();

const FLOOR_H = 1.5;

/** A school block: classrooms behind a columned front corridor (selasar) under an overhanging tiled roof. */
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
  const w = r.x1 - r.x0 + 1;
  const d = r.z1 - r.z0 + 1;
  const h = b.floors * FLOOR_H;
  const base = Math.min(tileElevation(r.x0, r.z0), tileElevation(r.x1, r.z1)) - 0.1;
  // The corridor runs along the south face, the side the camera looks at.
  const core = d - 1.1;
  const front = d / 2 - 0.55;
  const bays = Math.max(2, Math.round(w / 1.7));

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !fade) return;
    // The camera sits south of the player and above; a block just south of the player hides them, so it fades.
    const behind = player.z < r.z0 + 0.5 && player.z > r.z0 - 6 && player.x > r.x0 - 1.5 && player.x < r.x1 + 2.5;
    const target = behind ? 0.28 : 1;
    if (Math.abs(opacity.current - target) < 0.01) return;
    opacity.current += (target - opacity.current) * (1 - Math.exp(-dt * 10));
    const see = opacity.current < 0.99;
    g.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (!m || Array.isArray(m)) return;
      // Opaque shaders are compiled to ignore alpha, so switching modes needs a recompile.
      if (m.transparent !== see) {
        m.transparent = see;
        m.needsUpdate = true;
      }
      m.opacity = opacity.current;
    });
  });

  return (
    <group ref={ref} position={[r.x0 + w / 2, base, r.z0 + d / 2]}>
      {/* Classrooms */}
      <mesh position={[0, h / 2, -0.55]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.1, h, core]} />
        <meshStandardMaterial color={showRisk ? riskColor(risk) : "#efe3c8"} />
      </mesh>
      <mesh position={[0, 0.3, -0.55]}>
        <boxGeometry args={[w - 0.05, 0.6, core + 0.05]} />
        <meshStandardMaterial color="#9a8467" />
      </mesh>
      {b.floors > 1 && (
        <mesh position={[0, FLOOR_H, front - 0.5]} castShadow receiveShadow>
          <boxGeometry args={[w - 0.1, 0.16, 1.1]} />
          <meshStandardMaterial color="#d9cdb4" />
        </mesh>
      )}
      {/* Windows and doors on each floor, facing the corridor */}
      {Array.from({ length: b.floors }, (_, f) =>
        Array.from({ length: bays }, (_, i) => {
          const x = -w / 2 + (w / bays) * (i + 0.5);
          const door = f === 0 && i % 3 === 1;
          return (
            <group key={`${f}-${i}`} position={[x, f * FLOOR_H, core / 2 - 0.55 + 0.03]}>
              <mesh position={[0, door ? 0.55 : 0.85, 0]}>
                <boxGeometry args={[door ? 0.55 : 0.85, door ? 1.05 : 0.55, 0.05]} />
                <meshStandardMaterial color={door ? "#7a4a2b" : "#2b4a6b"} />
              </mesh>
              {!door && (
                <mesh position={[0, 0.85, 0.01]}>
                  <boxGeometry args={[0.04, 0.55, 0.06]} />
                  <meshStandardMaterial color="#e9f1f5" />
                </mesh>
              )}
            </group>
          );
        }),
      )}
      {/* Corridor floor and columns */}
      <mesh position={[0, 0.06, front]} receiveShadow>
        <boxGeometry args={[w, 0.12, 1.1]} />
        <meshStandardMaterial color="#cdbfa6" />
      </mesh>
      {Array.from({ length: bays + 1 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + 0.12 + ((w - 0.24) / bays) * i, h / 2, front + 0.42]} castShadow>
          <boxGeometry args={[0.16, h, 0.16]} />
          <meshStandardMaterial color="#f6f2ea" />
        </mesh>
      ))}
      {/* A 4-sided cone turned 45° is a hip roof; the outer scale stretches it over walls and corridor. */}
      <group position={[0, h + 0.55, 0.1]} scale={[(w + 0.7) / Math.SQRT2, 1, (d + 0.9) / Math.SQRT2]}>
        <mesh rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[1, 1.1, 4]} />
          <meshStandardMaterial color="#b4532a" flatShading />
        </mesh>
      </group>
      {showRisk && (
        <Html position={[0, h + 1.8, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
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
    const y = tileElevation(x, z);
    return (
      <group key={`${x}-${z}`} position={[x + 0.5, y, z + 0.5]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
          <ringGeometry args={[1.3, 1.6, 32]} />
          <meshStandardMaterial color={phase !== "idle" && !ok ? "#e0473c" : "#34c47c"} />
        </mesh>
        <Html position={[0, 2.5, -1.7]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
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
  const [x, z] = WARDEN;
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    // Turns to whoever walks up, then back to watching the yard.
    const target = getState().nearWarden ? Math.atan2(player.x - (x + 0.5), player.z - (z + 0.5)) : Math.PI / 4;
    const d = Math.atan2(Math.sin(target - g.rotation.y), Math.cos(target - g.rotation.y));
    g.rotation.y += d * (1 - Math.exp(-dt * 7));
  });
  return (
    <group position={[x + 0.5, tileElevation(x, z), z + 0.5]}>
      <group ref={ref} rotation-y={Math.PI / 4}>
        <Avatar look="j" name="Petugas Keselamatan" anim={() => (getState().chatOpen ? "emote-yes" : "idle")} />
      </group>
      {near && (
        <Html position={[0, 2.4, 0]} center zIndexRange={[30, 0]}>
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
      <meshPhongMaterial color="#3a8fc6" specular="#ffe2c2" shininess={70} transparent opacity={0.7} />
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
      <Scenery />
      <Terrain />
      <Coast />
      <Props />
      <Buildings risks={risks} showRisk={showRisk} fade />
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

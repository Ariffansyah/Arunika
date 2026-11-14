"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Box3, Matrix4, Vector3, type BufferGeometry, type InstancedMesh, type Material, type Mesh } from "three";

// Kenney kits (CC0), see the LICENSE.txt next to each kit in public/models.
export const M = {
  palms: ["tree_palm", "tree_palmBend", "tree_palmTall", "tree_palmDetailedTall", "tree_palmShort"].map((f) => `/models/nature/${f}.glb`),
  trees: ["tree_fat", "tree_oak", "tree_default", "tree_detailed"].map((f) => `/models/nature/${f}.glb`),
  bushes: ["plant_bush", "plant_bushLarge", "plant_bushDetailed"].map((f) => `/models/nature/${f}.glb`),
  flowers: ["flower_redA", "flower_yellowB"].map((f) => `/models/nature/${f}.glb`),
  rocks: ["rock_largeA", "rock_smallA"].map((f) => `/models/nature/${f}.glb`),
  houses: ["a", "c", "e", "g", "k", "n"].map((f) => `/models/suburban/building-type-${f}.glb`),
  tent: "/models/survival/tent-canvas.glb",
  tentFrame: "/models/survival/tent.glb",
  sign: "/models/survival/signpost-single.glb",
  crate: "/models/survival/box-large.glb",
  barrel: "/models/survival/barrel.glb",
  ambulance: "/models/cars/ambulance.glb",
  police: "/models/cars/police.glb",
  cone: "/models/cars/cone.glb",
};

type Fit = { height?: number; width?: number };

export default function Model({
  src,
  fit,
  ownMaterials = false,
  ...props
}: { src: string; fit?: Fit; ownMaterials?: boolean } & ThreeElements["group"]) {
  const { scene } = useGLTF(src);
  const height = fit?.height;
  const width = fit?.width;
  const { obj, scale } = useMemo(() => {
    const obj = scene.clone(true);
    obj.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Clones share materials; anything faded on its own needs a private copy.
        if (ownMaterials) (o as Mesh).material = ((o as Mesh).material as Material).clone();
      }
    });
    const size = new Box3().setFromObject(obj).getSize(new Vector3());
    const scale = height ? height / size.y : width ? width / Math.max(size.x, size.z) : 1;
    return { obj, scale };
  }, [scene, height, width, ownMaterials]);
  return (
    <group {...props}>
      <primitive object={obj} scale={scale} />
    </group>
  );
}

export const preloadModels = (srcs: string[]) => srcs.forEach((s) => useGLTF.preload(s));

export type Placement = { x: number; y: number; z: number; ry: number; size: [number, number, number] };
type Part = { geometry: BufferGeometry; material: Material; local: Matrix4 };

type Tilt = (k: number) => number;

function InstancedPart({ part, items, size, turn, tilt }: { part: Part; items: Placement[]; size: Vector3; turn: number; tilt?: Tilt }) {
  const ref = useRef<InstancedMesh>(null);
  const angles = useRef<number[]>([]);
  const write = useCallback(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const quarter = Math.abs(Math.sin(turn)) > 0.5;
    const m = new Matrix4();
    const r = new Matrix4();
    const x = new Matrix4();
    const s = new Matrix4();
    items.forEach((it, k) => {
      const [w, h, d] = it.size;
      const a = angles.current[k] ?? 0;
      s.makeScale((quarter ? d : w) / size.x, h / size.y, (quarter ? w : d) / size.z);
      r.makeRotationY(it.ry);
      // Tipping forward about the base; lifted so the back edge stays on the floor once it lies flat.
      x.makeRotationX(a).multiply(new Matrix4().makeRotationY(turn));
      mesh.setMatrixAt(k, m.makeTranslation(it.x, it.y + (Math.sin(a) * d) / 2, it.z).multiply(r).multiply(x).multiply(s).multiply(part.local));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, part, size, turn]);
  useLayoutEffect(() => {
    angles.current = items.map(() => 0);
    write();
  }, [items, write]);
  useFrame(() => {
    if (!tilt) return;
    let moved = false;
    items.forEach((_, k) => {
      const a = tilt(k);
      if (a !== angles.current[k]) {
        angles.current[k] = a;
        moved = true;
      }
    });
    if (moved) write();
  });
  return <instancedMesh ref={ref} args={[part.geometry, part.material, items.length]} castShadow receiveShadow />;
}

// Every copy of a model as one InstancedMesh per mesh in it: a few hundred desks stay a handful of draw calls.
// Each placement stretches the model to its size; `turn` points the model's front along +z; `tilt` topples copies.
export function Instances({ src, items, turn = 0, tilt }: { src: string; items: Placement[]; turn?: number; tilt?: Tilt }) {
  const { scene } = useGLTF(src);
  const { parts, size } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(scene);
    const center = box.getCenter(new Vector3());
    const toBase = new Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
    const parts: Part[] = [];
    scene.traverse((o) => {
      const mesh = o as Mesh;
      // Materials are copied so fading one building leaves the others alone.
      if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: (mesh.material as Material).clone(), local: toBase.clone().multiply(mesh.matrixWorld) });
    });
    return { parts, size: box.getSize(new Vector3()) };
  }, [scene]);
  if (!items.length) return null;
  return parts.map((p, i) => <InstancedPart key={i} part={p} items={items} size={size} turn={turn} tilt={tilt} />);
}

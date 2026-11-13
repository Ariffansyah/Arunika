"use client";

import { useGLTF } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { useMemo } from "react";
import { Box3, Vector3, type Mesh } from "three";

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

/** A static model, cloned so one file can be placed many times; `fit` scales it to a size in tiles. */
export default function Model({ src, fit, ...props }: { src: string; fit?: Fit } & ThreeElements["group"]) {
  const { scene } = useGLTF(src);
  const height = fit?.height;
  const width = fit?.width;
  const { obj, scale } = useMemo(() => {
    const obj = scene.clone(true);
    obj.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const size = new Box3().setFromObject(obj).getSize(new Vector3());
    const scale = height ? height / size.y : width ? width / Math.max(size.x, size.z) : 1;
    return { obj, scale };
  }, [scene, height, width]);
  return (
    <group {...props}>
      <primitive object={obj} scale={scale} />
    </group>
  );
}

export const preloadModels = (srcs: string[]) => srcs.forEach((s) => useGLTF.preload(s));

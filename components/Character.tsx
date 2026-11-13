"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Box3, Vector3, type Group, type Mesh } from "three";
import { clone as cloneRig } from "three/examples/jsm/utils/SkeletonUtils.js";

// Kenney "Mini Characters" (CC0), see public/characters/LICENSE.txt.
export const LOOKS = ["female-c", "male-a", "female-b", "male-f", "female-f", "female-e", "worker"] as const;
export type Look = (typeof LOOKS)[number];
export type Anim = "idle" | "walk" | "sprint" | "crouch" | "sit" | "emote-yes" | "wheelchair-sit" | "wheelchair-move-forward";

const url = (look: Look) => `/characters/character-${look}.glb`;
const CHAIR = "/characters/wheelchair.glb";

// `anim` is read every frame, so callers switch clips without re-rendering.
export default function Character({
  look,
  anim,
  height = 1.3,
  speed = 1,
  wheelchair = false,
}: {
  look: Look;
  anim: () => Anim;
  height?: number;
  speed?: number;
  wheelchair?: boolean;
}) {
  const { scene, animations } = useGLTF(url(look));
  const chair = useGLTF(CHAIR);
  // Skinned meshes need their skeleton cloned too, or every copy would share one pose.
  const { model, seat, scale } = useMemo(() => {
    const model = cloneRig(scene);
    const seat = chair.scene.clone(true);
    for (const o of [model, seat]) {
      o.traverse((c) => {
        if ((c as Mesh).isMesh) c.castShadow = true;
      });
    }
    return { model, seat, scale: height / new Box3().setFromObject(model).getSize(new Vector3()).y };
  }, [scene, chair.scene, height]);
  const ref = useRef<Group>(null);
  const { actions } = useAnimations(animations, ref);
  const playing = useRef<Anim | null>(null);

  useFrame(() => {
    const name = anim();
    if (name === playing.current) return;
    const next = actions[name];
    if (!next) return;
    const last = playing.current ? actions[playing.current] : null;
    next.reset().setEffectiveTimeScale(speed).play();
    if (last) next.crossFadeFrom(last, 0.2, false);
    playing.current = name;
  });

  return (
    <group ref={ref} scale={scale}>
      <primitive object={model} />
      {wheelchair && <primitive object={seat} />}
    </group>
  );
}

export const preloadCharacters = (looks: readonly Look[]) => {
  looks.forEach((l) => useGLTF.preload(url(l)));
  useGLTF.preload(CHAIR);
};

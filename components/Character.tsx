"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Box3, Vector3, type Group, type Mesh } from "three";
import { clone as cloneRig } from "three/examples/jsm/utils/SkeletonUtils.js";

// Kenney "Mini Characters" (CC0), see public/characters/LICENSE.txt.
export const LOOKS = ["female-c", "male-a", "female-b", "male-f", "female-f", "female-e", "worker"] as const;
export type Look = (typeof LOOKS)[number];
export type Anim = "idle" | "walk" | "sprint" | "crouch" | "sit" | "emote-yes";

const url = (look: Look) => `/characters/character-${look}.glb`;

// `anim` is read every frame, so callers switch clips without re-rendering.
export default function Character({
  look,
  anim,
  height = 1.3,
  speed = 1,
}: {
  look: Look;
  anim: () => Anim;
  height?: number;
  speed?: number;
}) {
  const { scene, animations } = useGLTF(url(look));
  // Skinned meshes need their skeleton cloned too, or every copy would share one pose.
  const { model, scale } = useMemo(() => {
    const model = cloneRig(scene);
    model.traverse((c) => {
      if ((c as Mesh).isMesh) c.castShadow = true;
    });
    return { model, scale: height / new Box3().setFromObject(model).getSize(new Vector3()).y };
  }, [scene, height]);
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
    </group>
  );
}

export const preloadCharacters = (looks: readonly Look[]) => looks.forEach((l) => useGLTF.preload(url(l)));

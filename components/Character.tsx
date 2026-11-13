"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Box3, Vector3, type Group, type Mesh } from "three";

// Kenney "Blocky Characters" (CC0), see public/characters/LICENSE.txt.
export const LOOKS = ["a", "b", "c", "e", "f", "j", "k", "m", "n", "p", "q"] as const;
export type Look = (typeof LOOKS)[number];
export type Anim = "idle" | "walk" | "sprint" | "sit" | "emote-yes" | "interact-right";

const url = (look: Look) => `/characters/character-${look}.glb`;

/** A rigged blocky character; `anim` is read every frame so callers can switch clips without re-rendering. */
export default function Character({
  look,
  anim,
  height = 1.35,
  speed = 1,
}: {
  look: Look;
  anim: () => Anim;
  height?: number;
  speed?: number;
}) {
  const { scene, animations } = useGLTF(url(look));
  // The parts are animated directly (no skeleton), so a plain deep clone animates independently.
  const { model, scale } = useMemo(() => {
    const model = scene.clone(true);
    model.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = true;
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

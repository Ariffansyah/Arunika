"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Box3, CircleGeometry, LoopOnce, MeshBasicMaterial, Vector3, type Group, type Mesh } from "three";
import { clone as cloneRig } from "three/examples/jsm/utils/SkeletonUtils.js";

// Quaternius "Ultimate Modular Men/Women" (CC0) in SMP uniform, see public/characters/LICENSE.txt.
export const LOOKS = ["siswi-a", "siswa-a", "siswi-b", "siswa-b", "siswi-c", "siswi-d", "siswa-c", "petugas"] as const;
export type Look = (typeof LOOKS)[number];
// `cover` is drop, cover, hold on: curled up small enough for a 0.75 m desk, arms over the neck.
// `vault` plays once: take-off, legs tucked, landing squat; the caller moves the body along the arc.
export const ANIMS = ["idle", "walk", "sprint", "crouch", "cover", "sit", "talk", "crouchWalk", "vault"] as const;
export type Anim = (typeof ANIMS)[number];
// The files start every stepping loop on the same foot, so a switch between them can keep the step.
const STRIDE = new Set<Anim>(["walk", "sprint", "crouchWalk"]);

const url = (look: Look) => `/characters/${look}.glb`;

// A soft dark disc at the feet stands in for a cast shadow where the device skips the shadow pass.
const BLOB = new CircleGeometry(0.24, 20).rotateX(-Math.PI / 2);
const BLOB_MAT = new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false });

// `anim` is read every frame, so callers switch clips without re-rendering. With a rate, a stepping clip
// plays that much faster, so feet keep pace with a walker slowed by water or a slower classmate.
export default function Character({
  look,
  anim,
  height = 1.6,
  shadow = "cast",
}: {
  look: Look;
  anim: () => Anim | [Anim, number];
  height?: number;
  shadow?: "cast" | "blob";
}) {
  const { scene, animations } = useGLTF(url(look));
  // Skinned meshes need their skeleton cloned too, or every copy would share one pose.
  const { model, scale } = useMemo(() => {
    const model = cloneRig(scene);
    model.traverse((c) => {
      if ((c as Mesh).isMesh) c.castShadow = shadow === "cast";
    });
    // Skinned bounds follow the bones, whose world matrices a fresh clone has not computed yet.
    model.updateMatrixWorld(true);
    return { model, scale: height / new Box3().setFromObject(model).getSize(new Vector3()).y };
  }, [scene, height, shadow]);
  const ref = useRef<Group>(null);
  const { actions } = useAnimations(animations, ref);
  const playing = useRef<Anim | null>(null);

  useFrame(() => {
    const out = anim();
    const [name, rate] = typeof out === "string" ? [out, 1] : out;
    const was = playing.current;
    const last = was ? actions[was] : null;
    if (name === was) {
      if (STRIDE.has(name)) last?.setEffectiveTimeScale(rate);
      return;
    }
    const next = actions[name];
    if (!next) return;
    next.reset().setEffectiveTimeScale(STRIDE.has(name) ? rate : 1);
    if (name === "vault") Object.assign(next.setLoop(LoopOnce, 1), { clampWhenFinished: true });
    const inStep = !!last && STRIDE.has(name) && STRIDE.has(was!);
    if (inStep) Object.assign(next, { time: (last.time / last.getClip().duration) * next.getClip().duration });
    next.play();
    // Changing pace keeps the step and blends fast; changing posture (sitting, ducking) takes longer.
    if (last) next.crossFadeFrom(last, inStep ? 0.2 : name === "vault" ? 0.08 : 0.3, false);
    playing.current = name;
  });

  return (
    <>
      {shadow === "blob" && <mesh geometry={BLOB} material={BLOB_MAT} position-y={0.02} renderOrder={-1} />}
      <group ref={ref} scale={scale}>
        <primitive object={model} />
      </group>
    </>
  );
}

export const preloadCharacters = (looks: readonly Look[]) => looks.forEach((l) => useGLTF.preload(url(l)));

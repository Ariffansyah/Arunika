"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";
import Character, { type Look } from "@/components/Character";
import "@/components/threeConsole";

// The chosen character turning slowly on the spot, as on a game's character select; still for reduced motion.
function Turntable({ look }: { look: Look }) {
  const ref = useRef<Group>(null);
  const still = useRef(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useFrame((_, dt) => {
    if (ref.current && !still.current) ref.current.rotation.y += dt * 0.6;
  });
  return (
    <group ref={ref} rotation-y={-0.4}>
      <Character look={look} anim={() => "idle"} height={1.6} shadow="blob" />
    </group>
  );
}

export default function CharacterStage({ look }: { look: Look }) {
  return (
    <Canvas camera={{ position: [0, 1.15, 3.4], fov: 30 }} dpr={[1, 2]} onCreated={({ camera }) => camera.lookAt(0, 0.85, 0)}>
      <hemisphereLight args={["#dfe8ff", "#3a3020", 1.6]} />
      <directionalLight position={[1.5, 2.5, 3]} intensity={2.2} />
      <Suspense fallback={null}>
        <Turntable look={look} />
      </Suspense>
    </Canvas>
  );
}

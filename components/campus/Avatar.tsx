"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { MathUtils, type Group } from "three";

/** Geometric avatar: coloured body, pale head, a dark visor showing which way it faces. */
export default function Avatar({
  color,
  name,
  crouching,
  self = false,
}: {
  color: string;
  name: string;
  crouching: () => boolean;
  self?: boolean;
}) {
  const body = useRef<Group>(null);
  useFrame(() => {
    if (body.current) body.current.scale.y = MathUtils.lerp(body.current.scale.y, crouching() ? 0.55 : 1, 0.3);
  });

  return (
    <>
      <group ref={body}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <capsuleGeometry args={[0.28, 0.5, 6, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, 1.15, 0]} castShadow>
          <sphereGeometry args={[0.22, 16, 12]} />
          <meshStandardMaterial color="#f4ecdc" />
        </mesh>
        <mesh position={[0, 1.17, 0.17]}>
          <boxGeometry args={[0.26, 0.09, 0.1]} />
          <meshStandardMaterial color="#0d1828" />
        </mesh>
      </group>
      <Html position={[0, 1.75, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <span
          className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${self ? "bg-fajar text-malam" : "bg-malam/85 text-pasir"}`}
        >
          {name}
        </span>
      </Html>
    </>
  );
}

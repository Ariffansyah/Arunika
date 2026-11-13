"use client";

import { Html } from "@react-three/drei";
import { Suspense } from "react";
import Character, { type Anim, type Look } from "@/components/Character";

export default function Avatar({
  look,
  name,
  anim,
  self = false,
  label = true,
}: {
  look: Look;
  name: string;
  anim: () => Anim;
  self?: boolean;
  label?: boolean;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <Character look={look} anim={anim} />
      </Suspense>
      {label && (
        <Html position={[0, 1.8, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <span
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${self ? "bg-fajar text-malam" : "bg-malam/85 text-pasir"}`}
          >
            {name}
          </span>
        </Html>
      )}
    </>
  );
}

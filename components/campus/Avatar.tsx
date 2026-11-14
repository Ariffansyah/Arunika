"use client";

import Html from "@/components/Html";
import { Suspense } from "react";
import Character, { type Anim, type Look } from "@/components/Character";

export default function Avatar({
  look,
  name,
  anim,
  self = false,
  label = true,
  height = 1.6,
}: {
  look: Look;
  name: string;
  anim: () => Anim;
  self?: boolean;
  label?: boolean;
  height?: number;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <Character look={look} anim={anim} height={height} />
      </Suspense>
      {label && (
        <Html position={[0, height + 0.3, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
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

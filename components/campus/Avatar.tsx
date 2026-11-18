"use client";

import Html from "@/components/Html";
import { Suspense } from "react";
import Character, { type Anim, type Look } from "@/components/Character";
import { TIER, useDrill } from "./drillStore";

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
  anim: () => Anim | [Anim, number];
  self?: boolean;
  label?: boolean;
  height?: number;
}) {
  const cast = TIER[useDrill((s) => s.quality)].shadows;
  return (
    <>
      <Suspense fallback={null}>
        <Character look={look} anim={anim} height={height} shadow={cast ? "cast" : "blob"} />
      </Suspense>
      {label && (
        <Html position={[0, height + 0.3, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <span
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${self ? "bg-laut text-white" : "bg-malam/85 text-pasir"}`}
          >
            {name}
          </span>
        </Html>
      )}
    </>
  );
}

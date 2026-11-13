"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

const WIDE = "(min-width: 1024px)";
const subscribe = (cb: () => void) => {
  const mq = matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

// Mounted only where the panel shows, so phones skip WebGL.
export default function StillScene() {
  const wide = useSyncExternalStore(subscribe, () => matchMedia(WIDE).matches, () => false);
  return wide ? (
    <div className="absolute inset-0">
      <HeroScene paused startAt={7} />
    </div>
  ) : null;
}

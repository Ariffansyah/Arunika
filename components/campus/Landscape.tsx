"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { ghost, primary } from "./ui";

// Not in TypeScript's DOM types: only some browsers can lock the orientation, and only in full screen.
type Lockable = ScreenOrientation & { lock?: (o: "landscape") => Promise<void>; unlock?: () => void };
const canFullscreen = () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

function goLandscape() {
  if (!canFullscreen() || document.fullscreenElement) return;
  document.documentElement
    .requestFullscreen({ navigationUI: "hide" })
    .then(() => (screen.orientation as Lockable).lock?.("landscape"))
    .catch(() => {});
}

// Phones play the drill sideways. Where the browser allows it (Chrome on Android), the first tap goes full screen and
// locks the screen to landscape: both need a user gesture. iPhone Safari has neither, so an upright phone is asked to
// turn, and may choose to stay upright.
export default function Landscape() {
  const [upright, setUpright] = useState(false);
  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches) return;
    addEventListener("pointerup", goLandscape, { once: true });
    return () => {
      removeEventListener("pointerup", goLandscape);
      (screen.orientation as Lockable).unlock?.();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  if (upright) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="putar-title"
      className="fixed inset-0 z-50 hidden flex-col items-center justify-center gap-6 bg-malam/95 p-6 text-center max-md:pointer-coarse:portrait:flex"
    >
      <Smartphone aria-hidden="true" className="size-16 text-langit motion-safe:animate-turn" />
      <h2 id="putar-title" className="max-w-[16ch] text-3xl font-extrabold tracking-tight">
        Putar ponsel ke posisi mendatar.
      </h2>
      <div className="grid w-full max-w-xs gap-2">
        {canFullscreen() && (
          <button type="button" autoFocus className={primary} onClick={goLandscape}>
            Layar penuh mendatar
          </button>
        )}
        <button type="button" className={ghost} onClick={() => setUpright(true)}>
          Tetap tegak
        </button>
      </div>
    </div>
  );
}

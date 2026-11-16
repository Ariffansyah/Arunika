import type { Material, Mesh, Object3D, Vector3 } from "three";
import { look, player } from "./drillStore";

// Liang-Barsky clip of the camera-to-player sight line against a footprint; returns where it enters, or null.
function sightEnters(cam: Vector3, x0: number, z0: number, x1: number, z1: number) {
  const dx = player.x - cam.x;
  const dz = player.z - cam.z;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, cam.x - x0],
    [dx, x1 - cam.x],
    [-dz, cam.z - z0],
    [dz, z1 - cam.z],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return t0 < 0.95 ? t0 : null;
}

// Whether something with this footprint and top stands between the camera and the player's eyes.
export function hides(cam: Vector3, top: number, x0: number, z0: number, x1: number, z1: number) {
  // From the aerial shot the player is a speck; buildings fading in and out as it circles would only distract.
  if (look.cine > 0.3) return false;
  const t = sightEnters(cam, x0, z0, x1, z1);
  if (t === null) return false;
  const eye = player.y + 1.4;
  return cam.y + (eye - cam.y) * t < top;
}

export function fadeTo(g: Object3D, opacity: number) {
  g.traverse((o) => {
    const m = (o as Mesh).material as Material | undefined;
    if (!m || Array.isArray(m)) return;
    // Glass is see-through on its own; fading scales its opacity instead of replacing it.
    const base: number = (m.userData.opacity ??= m.opacity);
    const see = opacity < 0.99 || base < 1;
    // Opaque shaders are compiled to ignore alpha, so switching modes needs a recompile.
    if (m.transparent !== see) {
      m.transparent = see;
      m.needsUpdate = true;
    }
    m.opacity = base * opacity;
  });
}

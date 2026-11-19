import { useSyncExternalStore } from "react";

const STEP = 30_000;
const subscribe = (cb: () => void) => {
  const id = setInterval(cb, STEP);
  return () => clearInterval(id);
};

// The clock in 30-second steps, or 0 while prerendering: cached pages must not bake "3 jam lalu" into their HTML.
export const useNow = () => useSyncExternalStore(subscribe, () => Math.floor(Date.now() / STEP) * STEP, () => 0);

// "3 jam lalu", or null before the clock is known, so callers fall back to BMKG's own timestamp.
export function ago(at: number, now: number) {
  if (!now) return null;
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} jam lalu`;
  return `${Math.floor(m / 60 / 24)} hari lalu`;
}

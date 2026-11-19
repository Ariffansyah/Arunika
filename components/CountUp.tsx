"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/components/useReducedMotion";
import { num } from "@/lib/format";

// Counts up to `value` with an ease-out whenever it changes. Screen readers get only the final number.
export default function CountUp({ value, ms = 1000 }: { value: number; ms?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(t) {
      const p = Math.min(1, (t - t0) / ms);
      setShown(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, ms, reduced]);
  return (
    <>
      <span aria-hidden="true">{num(reduced ? value : shown)}</span>
      <span className="sr-only">{num(value)}</span>
    </>
  );
}

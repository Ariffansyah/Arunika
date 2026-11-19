"use client";

import { useEffect, useRef } from "react";

// A band of words sliding past forever between two sections. Scrolling speeds it up, and scrolling back up turns
// it round until the page scrolls down again.
export default function Band({ words, reverse = false }: { words: string[]; reverse?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current;
    // No animation to steer when motion is reduced: the band stands still.
    const anim = el?.getAnimations()[0];
    if (!el || !anim) return;
    const base = reverse ? -1 : 1;
    let last = scrollY;
    let dir = 1;
    let rate = base;
    let raf = 0;
    let then = 0;
    const tick = (now: number) => {
      const v = scrollY - last;
      last = scrollY;
      if (v) dir = Math.sign(v);
      // Eased by elapsed time, so slow and fast screens settle alike.
      const k = then ? 1 - Math.exp(-(now - then) / 160) : 0;
      then = now;
      rate += (base * dir * (1 + Math.min(Math.abs(v) / 6, 8)) - rate) * k;
      anim.playbackRate = rate;
      raf = requestAnimationFrame(tick);
    };
    // Steered only while on screen.
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      last = scrollY;
      then = 0;
      if (e.isIntersecting) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reverse]);

  return (
    <div aria-hidden="true" className="overflow-hidden border-y border-malam-3 bg-malam-2 py-6 select-none sm:py-8">
      {/* Two copies side by side: sliding one copy's width brings the second exactly where the first began. */}
      <div ref={track} className="flex w-max motion-safe:animate-band">
        {[0, 1].map((copy) => (
          <span key={copy} className="flex shrink-0 items-center">
            {words.map((w, i) => (
              <span key={w} className="flex items-center gap-8 pr-8 text-5xl leading-none font-extrabold tracking-[-0.03em] whitespace-nowrap sm:gap-12 sm:pr-12 sm:text-7xl">
                <span className={i % 2 ? "text-transparent [-webkit-text-stroke:1.5px_var(--color-redup)]" : ""}>{w}</span>
                <span className="size-3 shrink-0 rotate-45 bg-langit sm:size-4" />
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

import { createContext, useEffect, useRef, useState } from "react";

// False while still copies cover the hero, so its 3D scene can stop drawing.
export const HeroLive = createContext(true);

// Times the page zooms into itself before it moves on, and copies nested inside each other: enough that the
// innermost stays under a pixel at any zoom.
const LOOPS = 3;
const DEPTH = 6;

// The frame sits at (--fx, --fy) as fractions of the stage and is --fs of its size both ways, so it has the stage's
// proportions and a copy of the stage fills it exactly.
const FRAME = { transform: "translate(calc(var(--fx) * 100%), calc(var(--fy) * 100%)) scale(var(--fs))" };
// Zooming about this point by 1 / --fs carries the frame onto the whole stage: it is the one point the frame's
// placement leaves where it was.
const ORIGIN = { transformOrigin: "calc(var(--fx) / (1 - var(--fs)) * 100%) calc(var(--fy) / (1 - var(--fs)) * 100%)" };

// A tablet held up in the hero. Its body lies wholly outside the screen, so once the screen fills the view the body
// has left it and nothing pops when the zoom starts over.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 origin-top-left" style={FRAME}>
      <div className="absolute -inset-10 rounded-[4.5rem] bg-[#0b1e3f] shadow-[0_0_0_6px_rgb(234_241_255/0.25),0_60px_160px_rgb(0_0_0/0.7)]" />
      <div className="absolute inset-0 overflow-hidden">{children}</div>
    </div>
  );
}

// A still of the hero, with the tablet showing the next copy.
function Copy({ depth }: { depth: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <picture>
        <source media="(orientation: portrait)" srcSet="/droste/beranda-tegak.webp" />
        <img src="/droste/beranda-lebar.webp" alt="" decoding="async" className="size-full object-cover" />
      </picture>
      {depth > 0 && (
        <Frame>
          <Copy depth={depth - 1} />
        </Frame>
      )}
    </div>
  );
}

// The Droste effect: the hero holds a tablet showing the hero. Scrolling pins the hero and zooms into the tablet until
// its screen fills the view, which is the hero again, three times over before the page moves on. The live hero only
// plays the first zoom; after that identical stills take over, so each loop restarts from the same picture.
export default function Droste({ children }: { children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLDivElement>(null);
  const loop = useRef<HTMLDivElement>(null);
  const [onLive, setOnLive] = useState(true);

  useEffect(() => {
    const w = wrap.current;
    const l = live.current;
    const o = loop.current;
    if (!w || !l || !o || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let zoom = 1;
    let raf = 0;
    const measure = () => {
      zoom = 1 / parseFloat(getComputedStyle(w).getPropertyValue("--fs"));
    };
    const draw = () => {
      raf = 0;
      const r = w.getBoundingClientRect();
      const s = Math.min(Math.max(-r.top / (r.height - innerHeight), 0), 1) * LOOPS;
      const first = s < 1;
      (first ? l : o).style.transform = `scale(${zoom ** (s - Math.floor(s))})`;
      l.style.visibility = first ? "visible" : "hidden";
      o.style.visibility = first ? "hidden" : "visible";
      setOnLive(first);
    };
    const onScroll = () => {
      raf ||= requestAnimationFrame(draw);
    };
    const onResize = () => {
      measure();
      onScroll();
    };
    measure();
    draw();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onResize);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <HeroLive.Provider value={onLive}>
      <div ref={wrap} className="droste relative [--fs:0.28] [--fx:0.64] [--fy:0.2] portrait:[--fx:0.55] portrait:[--fy:0.14]">
        <div className="sticky top-0 h-[100svh] min-h-[640px] overflow-hidden">
          <div ref={live} className="absolute inset-0" style={ORIGIN}>
            {children}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
              <Frame>
                <Copy depth={DEPTH - 1} />
              </Frame>
            </div>
          </div>
          <div ref={loop} aria-hidden="true" className="invisible absolute inset-0" style={ORIGIN}>
            <Copy depth={DEPTH} />
          </div>
        </div>
      </div>
    </HeroLive.Provider>
  );
}

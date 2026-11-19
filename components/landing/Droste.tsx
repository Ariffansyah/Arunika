"use client";

import { useEffect } from "react";

// The landing page as a Droste chain: a section ends on a tablet whose screen holds the next section, live and shrunk
// to fit. Scrolling on zooms into the tablet until its screen fills the view, and the next section is simply there.
//
// The tablet's screen sits at (--fx, --fy) as fractions of the section's last screenful and is --fs of it both ways,
// so the next section's first screenful fits it exactly. Zooming by 1 / --fs about f = (fx, fy) / (1 − fs) carries
// the screen onto the whole view: f is the one point that placing the screen leaves where it was.

const SCREEN = {
  left: "calc(var(--fx) * 100%)",
  top: "calc(var(--fy) * 100%)",
  width: "calc(var(--fs) * 100%)",
  height: "calc(var(--fs) * 100%)",
};

// Put at the end of a section whose next sibling is a section. Unless `tail` is off, it also adds room below the
// content, so the tablet sits in empty space rather than over it.
export function Portal({ tail = true, className = "[--fs:0.4] [--fx:0.3] [--fy:0.45]" }: { tail?: boolean; className?: string }) {
  return (
    <div
      data-portal
      aria-hidden="true"
      className={`pointer-events-none motion-reduce:hidden ${className}`}
      style={tail ? { height: "calc((1 - var(--fy)) * 100svh - 4rem)" } : undefined}
    >
      {/* The section's last screenful, as wide as the view even when the section is narrower. */}
      <div className="absolute bottom-0 left-1/2 h-[100svh] w-screen -translate-x-1/2">
        <div className="absolute" style={SCREEN}>
          {/* The tablet's body lies wholly outside the screen, so it has left the view by the time the screen fills
              it. The screen is the page's own ground, with the next section drawn over it. */}
          <div className="absolute -inset-3 rounded-[1.25rem] border border-pasir/25 bg-[#0b1e3f] shadow-[0_30px_80px_rgb(0_0_0/0.55)] sm:-inset-4" />
          <div className="absolute inset-0 bg-malam" />
        </div>
      </div>
    </div>
  );
}

type Pair = { a: HTMLElement; b: HTMLElement; fx: number; fy: number; fs: number };

// Drives every portal on the page. Layout never moves: sections only get transforms and a clip, so anchors, scroll
// position and the scroll-driven reveals inside them keep working.
export default function DrosteChain() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let pairs: Pair[] = [];
    let raf = 0;
    const measure = () => {
      pairs = [...document.querySelectorAll<HTMLElement>("[data-portal]")].flatMap((portal) => {
        const a = portal.parentElement;
        const b = a?.nextElementSibling;
        if (!a || !(b instanceof HTMLElement)) return [];
        const cs = getComputedStyle(portal);
        const v = (n: string) => parseFloat(cs.getPropertyValue(n));
        return [{ a, b, fx: v("--fx"), fy: v("--fy"), fs: v("--fs") }];
      });
    };
    // Every moved section is drawn as origin + t + k · (its own coordinates): a translation and a uniform scale.
    const set = (el: HTMLElement, tx: number, ty: number, k: number) => {
      el.style.transformOrigin = "0 0";
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    };
    const draw = () => {
      raf = 0;
      const vw = innerWidth;
      const vh = innerHeight;
      const moved = new Map<HTMLElement, { tx: number; ty: number; k: number }>();
      for (const { a, b, fx, fy, fs } of pairs) {
        const [ax, ay] = [a.offsetLeft, a.offsetTop - scrollY];
        const [bx, by] = [b.offsetLeft, b.offsetTop - scrollY];
        const rx = fx * vw;
        const ry = fy * vh;
        const [cx, cy] = [rx / (1 - fs), ry / (1 - fs)];
        // How far b has come in: 0 while its top is still at the foot of the view, 1 once it reaches the top.
        const p = Math.min(1, 1 - by / vh);
        const zoom = (1 / fs) ** Math.max(0, p);
        const held = moved.get(a);
        if (p >= 1) {
          b.style.transform = b.style.clipPath = "";
        } else {
          // Shrunk onto a's tablet, which rides along with a until the zoom starts and grows with it after. A section
          // narrower than the view keeps its place in the screenful.
          let k = zoom * fs;
          let tx = cx + zoom * (rx - cx) + k * bx - bx;
          let ty = p <= 0 ? ry - vh : cy + zoom * (ry - cy) - vh * (1 - p);
          // a may itself still sit shrunk on its own predecessor's tablet: then b goes wherever that puts a's tablet.
          if (held) {
            tx = ax + held.tx + held.k * (bx + tx - ax) - bx;
            ty = ay + held.ty + held.k * (by + ty - ay) - by;
            k *= held.k;
          }
          set(b, tx, ty, k);
          moved.set(b, { tx, ty, k });
          // Only its first screenful belongs on the tablet.
          b.style.clipPath = `inset(0 0 ${Math.max(0, b.offsetHeight - vh)}px 0)`;
        }
        if (held) continue;
        if (p > 0 && p < 1) {
          // a is held on its last screenful against the scroll, where it stood at p = 0, and zoomed about f.
          const tx = cx + zoom * (ax - cx) - ax;
          const ty = cy + zoom * (ay + p * vh - cy) - ay;
          set(a, tx, ty, zoom);
          moved.set(a, { tx, ty, k: zoom });
        } else {
          a.style.transform = "";
        }
      }
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
    // Content that changes height (a lesson tab, the warnings list) moves every later section.
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      ro.disconnect();
      cancelAnimationFrame(raf);
      for (const { a, b } of pairs) a.style.transform = b.style.transform = b.style.clipPath = "";
    };
  }, []);
  return null;
}

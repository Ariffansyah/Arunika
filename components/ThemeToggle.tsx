"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect, useSyncExternalStore } from "react";

const KEY = "arunika:tema";
// Inlined in <head>: it runs while the HTML parses, so a saved light theme never paints dark first.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const root = () => document.documentElement;
const subscribe = (cb: () => void) => {
  const o = new MutationObserver(cb);
  o.observe(root(), { attributeFilter: ["data-theme"] });
  return () => o.disconnect();
};
const isLight = () => root().dataset.theme === "light";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const light = useSyncExternalStore(subscribe, isLight, () => false);

  // React's dev-mode remount resets the attributes on <html>; put the saved theme back before paint.
  useLayoutEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") root().dataset.theme = t;
    } catch {}
  }, []);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = light ? "dark" : "light";
    const apply = () => {
      root().dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {}
    };
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    // The new theme grows out of the button as a circle until it covers the farthest corner.
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document
      .startViewTransition(apply)
      .ready.then(() =>
        root().animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
          { duration: 750, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Mode terang"
      aria-pressed={light}
      className={`flex size-11 shrink-0 items-center justify-center rounded-md border transition-colors duration-300 ease-crisp ${className}`}
    >
      {light ? <Moon aria-hidden="true" className="size-5" /> : <Sun aria-hidden="true" className="size-5" />}
    </button>
  );
}

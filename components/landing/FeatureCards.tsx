"use client";

import { ArrowRight, Camera, Map, MessagesSquare } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, PointerEvent } from "react";

const FEATURES = [
  { href: "/kampus", icon: MessagesSquare, title: "Petugas AI", text: "Tanya petugas keselamatan AI, lewat teks atau suara." },
  { href: "/analisis", icon: Camera, title: "Analisis bangunan", text: "Nilai ketahanan bangunan sekolah dari satu foto." },
  { href: "/dashboard", icon: Map, title: "Dasbor kesiapan", text: "Pantau kesiapan sekolah di peta Indonesia." },
];

// Tilts toward the cursor and moves the glow with it. Touch and pen skip it so a swipe never wobbles the card.
function track(e: PointerEvent<HTMLAnchorElement>) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty("--x", `${x * 100}%`);
  el.style.setProperty("--y", `${y * 100}%`);
  el.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
  el.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
}

function settle(e: PointerEvent<HTMLAnchorElement>) {
  e.currentTarget.style.removeProperty("--rx");
  e.currentTarget.style.removeProperty("--ry");
}

export default function FeatureCards() {
  return (
    <nav aria-label="Fitur lain" className="border-t border-malam-3">
      <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:px-6 md:grid-cols-3 lg:py-24">
        {FEATURES.map(({ href, icon: Icon, title, text }, i) => (
          <li key={href} className="reveal" style={{ "--delay": `${i * 12}%` } as CSSProperties}>
            <Link
              href={href}
              onPointerMove={track}
              onPointerLeave={settle}
              className="group relative flex h-full min-h-64 flex-col overflow-hidden rounded-xl border border-malam-3 bg-malam-2 p-6 transition-[transform,translate,border-color,box-shadow] duration-300 ease-out [transform:perspective(900px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(420px_circle_at_var(--x,50%)_var(--y,0%),rgb(255_138_61/0.18),transparent_60%)] before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-1 hover:border-fajar/60 hover:shadow-[0_24px_60px_-24px_rgb(255_138_61/0.45)] hover:before:opacity-100 focus-visible:-translate-y-1 focus-visible:border-fajar/60 focus-visible:before:opacity-100 sm:p-7"
            >
              <span className="relative flex size-12 items-center justify-center rounded-lg bg-fajar/12 text-fajar transition-colors group-hover:bg-fajar group-hover:text-malam">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <span className="relative mt-8 text-2xl font-bold tracking-tight">{title}</span>
              <span className="relative mt-2 mb-6 text-lg leading-relaxed text-redup">{text}</span>
              <ArrowRight
                aria-hidden="true"
                className="relative mt-auto size-7 self-end text-fajar transition-transform group-hover:translate-x-1"
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

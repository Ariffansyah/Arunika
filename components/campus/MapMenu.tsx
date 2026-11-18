"use client";

import Link from "next/link";
import { useEffect } from "react";
import SitePlan, { CAMPUSES } from "@/components/SitePlan";
import { MAPS, type Setting } from "@/lib/maps";
import type { School } from "@/lib/supabase";

// The level select: one school per card, keys 1 to 3 as in a game menu. Plain links and full page loads, not client
// routes: the engine fixes its map when the page opens.
export default function MapMenu({ school, search }: { school: School | null; search: string }) {
  const href = (id: Setting) => {
    const q = new URLSearchParams(search);
    q.set("peta", id);
    return `/sekolah?${q}`;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const pick = CAMPUSES[Number(e.key) - 1];
      if (pick && !e.ctrlKey && !e.metaKey && !e.altKey) location.assign(href(pick.id));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 text-lg font-extrabold tracking-wider text-pasir uppercase">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo mark, nothing to optimise */}
          <img src="/arunika-mark.svg" alt="" width={24} height={27} className="h-7 w-auto" />
          Arunika
        </Link>
        <span className="ml-auto truncate text-redup">{school?.name ?? "Sekolah contoh"}</span>
      </header>
      <section aria-labelledby="menu-title" className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pt-6 pb-12 sm:px-6">
        <h1 id="menu-title" className="animate-rise text-4xl font-extrabold tracking-tight sm:text-5xl">
          Pilih peta
        </h1>
        <ul className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {CAMPUSES.map(({ id, hazard }, i) => (
            <li key={id} className="animate-rise" style={{ animationDelay: `${100 + i * 80}ms` }}>
              <a
                href={href(id)}
                className="group flex items-center gap-4 rounded-lg border border-malam-3 bg-malam-2 p-3 transition-colors duration-200 hover:border-laut hover:bg-malam-3 sm:flex-col sm:items-stretch sm:p-4"
              >
                <SitePlan
                  id={id}
                  className="h-auto w-28 shrink-0 rounded-md bg-malam transition-transform duration-300 group-hover:scale-[1.02] sm:w-full"
                />
                <span className="flex flex-1 items-center justify-between gap-3">
                  <span className="text-xl leading-tight font-bold">
                    {MAPS[id]!.name} <span className="font-medium text-redup group-hover:text-pasir/85">{hazard}</span>
                  </span>
                  <kbd aria-hidden="true" className="hidden rounded border border-malam-3 px-2 py-0.5 text-sm text-redup pointer-fine:inline">
                    {i + 1}
                  </kbd>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

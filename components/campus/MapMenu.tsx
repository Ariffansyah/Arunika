"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import CharacterPicker from "@/components/CharacterPicker";
import { HAZARD_ICON } from "@/components/hazards";
import type { Me } from "@/components/RequireAuth";
import SitePlan, { CAMPUSES } from "@/components/SitePlan";
import { HAZARD_LABEL } from "@/lib/gladi";
import { MAPS, type Setting } from "@/lib/maps";
import { avatarOf } from "@/lib/supabase";

const CharacterStage = dynamic(() => import("./CharacterStage"), { ssr: false });

// The level select: one school per card, keys 1 to 3 as in a game menu. Plain links and full page loads, not client
// routes: the engine fixes its map when the page opens.
export default function MapMenu({ me, search }: { me: Me; search: string }) {
  const [avatar, setAvatar] = useState(me.profile.avatar);
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
    // The survey grid of the landing page's plan demo: this is the site plan the drill is played on.
    <div className="flex flex-1 flex-col bg-[linear-gradient(rgb(175_196_236/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(175_196_236/0.05)_1px,transparent_1px)] bg-[size:32px_32px]">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 text-lg font-extrabold tracking-wider text-pasir uppercase">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo mark, nothing to optimise */}
          <img src="/arunika-mark.svg" alt="" width={24} height={27} className="h-7 w-auto" />
          Arunika
        </Link>
        <span className="ml-auto truncate text-redup">{me.school?.name ?? "Sekolah contoh"}</span>
      </header>
      <section aria-labelledby="menu-title" className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pt-6 pb-12 sm:px-6">
        <h1 id="menu-title" className="animate-rise text-5xl font-extrabold tracking-[-0.03em] sm:text-7xl">
          Pilih peta
        </h1>
        <ul className="mt-10 grid gap-3 sm:grid-cols-3 sm:gap-5">
          {CAMPUSES.map(({ id, hazard }, i) => (
            <li key={id} className="animate-rise" style={{ animationDelay: `${100 + i * 80}ms` }}>
              <a
                href={href(id)}
                className="group flex items-center gap-4 rounded-xl border border-malam-3 bg-malam-2 p-3 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)] transition-[border-color,background-color,translate] duration-200 hover:-translate-y-1 hover:border-laut hover:bg-malam-3 sm:flex-col sm:items-stretch sm:p-4"
              >
                <span className="relative w-28 shrink-0 sm:w-full">
                  <SitePlan id={id} className="block h-auto w-full rounded-lg bg-malam" />
                  <span className="absolute bottom-2 left-2 hidden gap-2.5 rounded-md bg-malam/90 px-2.5 py-2 text-langit shadow-lg sm:flex">
                    {MAPS[id]!.disasters.map((k) => {
                      const Icon = HAZARD_ICON[k];
                      return (
                        <span key={k} title={HAZARD_LABEL[k]}>
                          <Icon aria-hidden="true" className="size-5" />
                        </span>
                      );
                    })}
                  </span>
                </span>
                <span className="flex flex-1 items-center justify-between gap-3">
                  <span className="text-xl leading-tight font-bold sm:text-2xl">
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
        <section aria-labelledby="karakter-title" className="mt-14 animate-rise [animation-delay:340ms]">
          <h2 id="karakter-title" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Karakter
          </h2>
          <div className="mt-6 grid gap-5 rounded-xl border border-malam-3 bg-malam-2 p-4 sm:p-5 md:grid-cols-[16rem_minmax(0,1fr)] md:items-center">
            <div className="h-72 overflow-hidden rounded-lg bg-[radial-gradient(ellipse_at_50%_85%,#1b3461,#071530_70%)] md:h-80">
              <CharacterStage look={avatarOf(avatar)} />
            </div>
            <CharacterPicker profileId={me.profile.id} value={avatar} onChange={setAvatar} cols="grid-cols-4 sm:grid-cols-7 md:grid-cols-4 lg:grid-cols-7" />
          </div>
        </section>
      </section>
    </div>
  );
}

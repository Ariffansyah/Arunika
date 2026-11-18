import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import StillScene from "@/components/landing/StillScene";
import ThemeToggle from "@/components/ThemeToggle";
import { AVATARS } from "@/lib/supabase";
import LoginFlow from "./LoginFlow";

export const metadata: Metadata = { title: "Masuk" };

const logo = "flex min-h-11 items-center gap-2.5 text-lg font-extrabold tracking-wider text-pasir uppercase";
const mark = (
  // eslint-disable-next-line @next/next/no-img-element -- static SVG logo mark, nothing to optimise
  <img src="/arunika-mark.svg" alt="" width={24} height={27} className="h-7 w-auto" />
);

export default function MasukPage() {
  return (
    <main className="grid min-h-[100svh] flex-1 lg:grid-cols-[1.2fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[linear-gradient(180deg,#1d2c4b_0%,#4a4a66_55%,#b86f50_100%)] lg:block">
        <StillScene />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-malam/70 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-malam from-10% via-malam/75 via-50% to-transparent"
        />
        <Link href="/" className={`absolute top-4 left-8 ${logo}`}>
          {mark}
          Arunika
        </Link>
        <div className="absolute inset-x-8 bottom-10 space-y-6 xl:inset-x-12 xl:bottom-14">
          <ul aria-hidden="true" className="flex -space-x-3">
            {AVATARS.map((look) => (
              <li key={look}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 128px sprites, nothing to optimise */}
                <img src={`/characters/previews/${look}.png`} alt="" width={64} height={64} className="size-16 rounded-full border-4 border-malam bg-malam-2" />
              </li>
            ))}
          </ul>
          <p className="max-w-[18ch] text-4xl leading-[1.02] font-extrabold tracking-tight xl:text-5xl">
            Satu akun untuk latihan, gladi, dan dasbor.
          </p>
        </div>
      </div>
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className={`${logo} lg:invisible`}>
            {mark}
            Arunika
          </Link>
          <ThemeToggle className="border-malam-3 text-redup hover:border-redup hover:text-pasir" />
        </div>
        <div className="m-auto w-full max-w-sm py-10">
          <Suspense>
            <LoginFlow />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

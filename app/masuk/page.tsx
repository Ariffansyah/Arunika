import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import StillScene from "@/components/landing/StillScene";
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
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgb(7_21_48/0.7),transparent)]"
        />
        <Link href="/" className={`absolute top-4 left-8 ${logo}`}>
          {mark}
          Arunika
        </Link>
      </div>
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/" className={`${logo} self-start lg:hidden`}>
          {mark}
          Arunika
        </Link>
        <div className="m-auto w-full max-w-sm py-10">
          <Suspense>
            <LoginFlow />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

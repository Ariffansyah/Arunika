import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import StillScene from "@/components/landing/StillScene";
import LoginFlow from "./LoginFlow";

export const metadata: Metadata = { title: "Masuk" };

const logo = "text-lg font-extrabold tracking-tight text-pasir";

export default function MasukPage() {
  return (
    <main className="grid min-h-[100svh] flex-1 lg:grid-cols-[1.2fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[linear-gradient(180deg,#1d2c4b_0%,#4a4a66_55%,#b86f50_100%)] lg:block">
        <StillScene />
        <Link href="/" className={`absolute top-6 left-8 ${logo}`}>
          Arunika<span className="text-fajar">.</span>
        </Link>
      </div>
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/" className={`${logo} self-start lg:hidden`}>
          Arunika<span className="text-fajar">.</span>
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

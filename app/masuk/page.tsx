import type { Metadata } from "next";
import { Suspense } from "react";
import SiteHeader from "@/components/SiteHeader";
import LoginFlow from "./LoginFlow";

export const metadata: Metadata = { title: "Masuk" };

export default function MasukPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12">
        <Suspense>
          <LoginFlow />
        </Suspense>
      </main>
    </>
  );
}

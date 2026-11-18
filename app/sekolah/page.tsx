import type { Metadata } from "next";
import { Suspense } from "react";
import CampusClient from "@/components/campus/CampusClient";

export const metadata: Metadata = { title: "Sekolah" };

export default function SekolahPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <CampusClient />
      </Suspense>
    </main>
  );
}

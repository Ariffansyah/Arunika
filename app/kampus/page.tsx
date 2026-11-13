import type { Metadata } from "next";
import { Suspense } from "react";
import CampusClient from "@/components/campus/CampusClient";

export const metadata: Metadata = { title: "Kampus 3D" };

export default function KampusPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <CampusClient />
      </Suspense>
    </main>
  );
}

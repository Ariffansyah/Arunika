import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import Analyzer from "./Analyzer";

export const metadata: Metadata = { title: "Analisis Struktur" };

export default function AnalisisPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Analisis kerentanan bangunan</h1>
        <Analyzer />
      </main>
    </>
  );
}

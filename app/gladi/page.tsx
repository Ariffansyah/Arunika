import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { latestQuake } from "@/lib/bmkg";
import Gladi from "./Gladi";

export const metadata: Metadata = { title: "Gladi ruang" };

export default async function GladiPage() {
  const quake = await latestQuake();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Gladi ruang</h1>
        <Gladi quake={quake} />
      </main>
    </>
  );
}

import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import Dashboard from "./Dashboard";

export const metadata: Metadata = { title: "Dasbor" };

export default function DashboardPage() {
  return (
    <>
      <SiteHeader current="/dashboard" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-5xl font-extrabold tracking-[-0.03em] sm:text-6xl">Dasbor kesiapan sekolah</h1>
        <Dashboard />
      </main>
    </>
  );
}

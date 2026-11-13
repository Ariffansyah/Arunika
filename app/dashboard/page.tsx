import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import Dashboard from "./Dashboard";

export const metadata: Metadata = { title: "Dasbor Kesiapan" };

export default function DashboardPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Dasbor kesiapan sekolah</h1>
        <Dashboard />
      </main>
    </>
  );
}

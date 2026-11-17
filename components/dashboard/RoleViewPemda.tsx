"use client";

import { AlertTriangle, CheckCircle, Download, Landmark, OctagonAlert } from "lucide-react";
import type { Me } from "@/components/RequireAuth";
import type { School } from "@/lib/supabase";

export type RegionalSchoolRow = School & {
  drills: number | null;
  participants: number | null;
  avg_score: number | null;
  structural_score: number | null;
  readiness: number | null;
  exposure: number;
};

export default function RoleViewPemda({
  me,
  schools,
  filter,
  onFilterChange,
}: {
  me: Me;
  schools: RegionalSchoolRow[];
  filter: "all" | "rawan" | "penguatan" | "siap";
  onFilterChange: (f: "all" | "rawan" | "penguatan" | "siap") => void;
}) {
  const rawanCount = schools.filter((s) => (s.readiness ?? 0) < 45).length;
  const penguatanCount = schools.filter((s) => (s.readiness ?? 0) >= 45 && (s.readiness ?? 0) < 70).length;
  const siapCount = schools.filter((s) => (s.readiness ?? 0) >= 70).length;
  const avgReadiness =
    schools.length > 0
      ? Math.round(schools.reduce((acc, s) => acc + (s.readiness ?? 0), 0) / schools.length)
      : 0;

  const exportRegionalCsv = () => {
    if (schools.length === 0) return;
    const headers = ["Nama Sekolah", "Wilayah", "Ancaman Bahaya", "Indeks Kesiapan", "Paparan Risiko", "Skor Struktur", "Total Latihan Siswa"];
    const rows = schools.map((s) => [
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.region.replace(/"/g, '""')}"`,
      `"${s.hazards.join(", ")}"`,
      s.readiness ?? "–",
      s.exposure,
      s.structural_score ?? "–",
      s.drills ?? 0,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `analisis-kesiapsiagaan-wilayah-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Pemda Header Banner */}
      <div className="flex flex-col gap-4 rounded-xl border border-malam-3 bg-malam-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-malam-3 border border-fajar/30 text-fajar">
            <Landmark className="size-8" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-pasir">{me.profile.display_name}</h2>
              <span className="rounded-full bg-fajar/20 px-2.5 py-0.5 text-xs font-semibold text-fajar">
                Pemerintah Daerah / BPBD
              </span>
            </div>
            <p className="text-sm text-redup">
              Portal Monitoring Mitigasi Wilayah & Prioritas Bantuan Prasarana Pendidikan
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={exportRegionalCsv}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-fajar px-5 text-sm font-semibold text-malam hover:bg-fajar-tua"
        >
          <Download className="size-4" aria-hidden="true" />
          Ekspor Data Wilayah (CSV)
        </button>
      </div>

      {/* Regional Macro Metrics */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-malam-3 bg-malam-2 p-4">
          <span className="text-xs font-medium text-redup">Total Sekolah Dipantau</span>
          <p className="mt-1 text-2xl font-extrabold text-pasir tabular-nums">
            {schools.length}{" "}
            <span className="text-sm font-normal text-redup">sekolah</span>
          </p>
          <p className="mt-1 text-xs text-redup">Rata-rata kesiapan wilayah: {avgReadiness}/100</p>
        </div>

        <div className="rounded-xl border border-bahaya/40 bg-bahaya/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-bahaya">Zona Rawan (Prioritas 1)</span>
            <OctagonAlert className="size-4 text-bahaya" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-extrabold text-bahaya tabular-nums">
            {rawanCount}{" "}
            <span className="text-sm font-normal text-redup">sekolah</span>
          </p>
          <p className="mt-1 text-xs text-redup">Butuh intervensi fisik segera</p>
        </div>

        <div className="rounded-xl border border-fajar/40 bg-fajar/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fajar">Perlu Penguatan (Prioritas 2)</span>
            <AlertTriangle className="size-4 text-fajar" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-extrabold text-fajar tabular-nums">
            {penguatanCount}{" "}
            <span className="text-sm font-normal text-redup">sekolah</span>
          </p>
          <p className="mt-1 text-xs text-redup">Kombinasi perbaikan & drill berkala</p>
        </div>

        <div className="rounded-xl border border-aman/40 bg-aman/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-aman">Kategori Siaga (Mandiri)</span>
            <CheckCircle className="size-4 text-aman" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-extrabold text-aman tabular-nums">
            {siapCount}{" "}
            <span className="text-sm font-normal text-redup">sekolah</span>
          </p>
          <p className="mt-1 text-xs text-redup">Memenuhi standar BNPB & PU</p>
        </div>
      </div>

      {/* Filter Selector Bar for Region */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-malam-3 bg-malam-2 px-4 py-2.5">
        <span className="text-xs font-semibold text-redup">Filter Status Kesiapsiagaan Sekolah:</span>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { id: "all", label: `Semua (${schools.length})` },
            { id: "rawan", label: `Rawan (${rawanCount})` },
            { id: "penguatan", label: `Perlu Penguatan (${penguatanCount})` },
            { id: "siap", label: `Siap (${siapCount})` },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id as typeof filter)}
              className={`rounded-md px-3 py-1 font-semibold transition-colors ${
                filter === item.id
                  ? "bg-fajar text-malam"
                  : "bg-malam text-pasir hover:bg-malam-3"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

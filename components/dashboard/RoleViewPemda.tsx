"use client";

import type { Me } from "@/components/RequireAuth";
import type { School } from "@/lib/supabase";
import { STATUS, primaryBtn } from "./ui";

export type RegionalSchoolRow = School & {
  drills: number | null;
  participants: number | null;
  avg_score: number | null;
  structural_score: number | null;
  readiness: number | null;
  exposure: number;
};

type Filter = "all" | "rawan" | "penguatan" | "siap";

export default function RoleViewPemda({
  schools,
  filter,
  onFilterChange,
}: {
  me: Me;
  schools: RegionalSchoolRow[];
  filter: Filter;
  onFilterChange: (f: Filter) => void;
}) {
  const rawan = schools.filter((s) => (s.readiness ?? 0) < 45).length;
  const penguatan = schools.filter((s) => (s.readiness ?? 0) >= 45 && (s.readiness ?? 0) < 70).length;
  const siap = schools.filter((s) => (s.readiness ?? 0) >= 70).length;
  const avg = schools.length ? Math.round(schools.reduce((acc, s) => acc + (s.readiness ?? 0), 0) / schools.length) : 0;

  const exportRegionalCsv = () => {
    if (schools.length === 0) return;
    const headers = ["Nama Sekolah", "Wilayah", "Ancaman Bahaya", "Indeks Kesiapan", "Paparan Risiko", "Skor Gladi Ruang", "Total Latihan Siswa"];
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
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `kesiapsiagaan-wilayah-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filters: { id: Filter; label: string; count: number; Icon?: (typeof STATUS)[number]["Icon"]; color?: string }[] = [
    { id: "all", label: "Semua", count: schools.length },
    { id: "rawan", label: "Rawan", count: rawan, Icon: STATUS[2].Icon, color: STATUS[2].color },
    { id: "penguatan", label: "Perlu penguatan", count: penguatan, Icon: STATUS[1].Icon, color: STATUS[1].color },
    { id: "siap", label: "Siap", count: siap, Icon: STATUS[0].Icon, color: STATUS[0].color },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="max-w-[28ch] text-3xl font-extrabold tracking-tight sm:text-4xl">
          {rawan} dari {schools.length} sekolah rawan. Rata-rata kesiapan {avg}.
        </h2>
        <button type="button" onClick={exportRegionalCsv} className={primaryBtn}>
          Ekspor CSV
        </button>
      </div>
      <div role="group" aria-label="Saring sekolah" className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => onFilterChange(f.id)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-malam-3 px-4 font-semibold hover:border-redup aria-pressed:border-laut aria-pressed:bg-laut aria-pressed:text-white"
          >
            {f.Icon && <f.Icon aria-hidden="true" className="size-4" style={{ color: filter === f.id ? undefined : f.color }} />}
            {f.label}
            <span className="tabular-nums opacity-80">{f.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

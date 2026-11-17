"use client";

import { AlertOctagon, Building2, ImageUp, Printer, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Me } from "@/components/RequireAuth";
import { COST_LABEL, PRIORITY_LABEL, type Recommendation } from "@/lib/assessment";
import type { School } from "@/lib/supabase";

export default function RoleViewKepalaSekolah({
  me,
  school,
  readiness,
  structuralScore,
  drillScore,
  totalDrills,
  recommendations,
}: {
  me: Me;
  school: School | null;
  readiness: number | null;
  structuralScore: number | null;
  drillScore: number | null;
  totalDrills: number;
  recommendations: Recommendation[];
}) {
  const [printModal, setPrintModal] = useState(false);

  const status =
    (readiness ?? 0) >= 70
      ? { label: "Kategori Siaga (Aman)", color: "#2fae6b", desc: "Sekolah memiliki prosedur dan ketahanan dasar yang memadai." }
      : (readiness ?? 0) >= 45
        ? { label: "Perlu Penguatan Mitigasi", color: "#d9a520", desc: "Perlu perbaikan fisik atau peningkatan frekuensi simulasi siswa." }
        : { label: "Kategori Rawan (Prioritas Intervensi)", color: "#e5484d", desc: "Tingkat kerentanan tinggi, segera prioritaskan perkuatan gedung." };

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <div className="flex flex-col gap-4 rounded-xl border border-malam-3 bg-malam-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-malam-3 border border-fajar/30 text-fajar">
            <Building2 className="size-8" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-pasir">{me.profile.display_name}</h2>
              <span className="rounded-full bg-fajar/20 px-2.5 py-0.5 text-xs font-semibold text-fajar">
                Kepala Sekolah
              </span>
            </div>
            <p className="text-sm text-redup">
              Laporan Eksekutif Kesiapsiagaan · {school?.name ?? "Sekolah Terbuka"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setPrintModal(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-fajar px-5 text-sm font-semibold text-malam hover:bg-fajar-tua"
          >
            <Printer className="size-4" aria-hidden="true" />
            Cetak Laporan Audit Resmi
          </button>
          <Link
            href="/analisis"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-malam-3 bg-malam px-4 text-sm font-semibold text-pasir hover:border-redup"
          >
            <ImageUp className="size-4" aria-hidden="true" />
            Analisis Foto Gedung Baru
          </Link>
        </div>
      </div>

      {/* Readiness Index & 2 Pillars Breakdown */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-malam-3 bg-malam-2 p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-redup">Indeks Kesiapan Sekolah</span>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-4xl font-extrabold tabular-nums text-pasir">
              {readiness ?? "–"}
            </p>
            <span className="text-sm font-normal text-redup">/ 100</span>
          </div>
          <p className="mt-2 text-xs font-semibold" style={{ color: status.color }}>
            {status.label}
          </p>
          <p className="mt-1 text-xs text-redup">{status.desc}</p>
        </div>

        <div className="rounded-xl border border-malam-3 bg-malam-2 p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-redup">Pilar 1: Ketahanan Fisik Bangunan</span>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-4xl font-extrabold tabular-nums text-pasir">
              {structuralScore ?? "–"}
            </p>
            <span className="text-sm font-normal text-redup">/ 100</span>
          </div>
          <p className="mt-2 text-xs text-redup">Berdasarkan audit foto elemen struktural AI</p>
          <Link href="/analisis" className="mt-2 inline-block text-xs font-bold text-fajar hover:underline">
            Lihat atau perbarui asesmen foto &rarr;
          </Link>
        </div>

        <div className="rounded-xl border border-malam-3 bg-malam-2 p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-redup">Pilar 2: Kesiapan Warga Sekolah</span>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-4xl font-extrabold tabular-nums text-pasir">
              {drillScore ? Math.round(drillScore / 10) : "–"}
            </p>
            <span className="text-sm font-normal text-redup">/ 100</span>
          </div>
          <p className="mt-2 text-xs text-redup">Dari {totalDrills} sesi latihan simulasi siswa & guru</p>
          <Link href={`/kampus?room=${school?.id ?? "umum"}`} className="mt-2 inline-block text-xs font-bold text-fajar hover:underline">
            Kunjungi kampus simulasi &rarr;
          </Link>
        </div>
      </div>

      {/* Priority Recommendations Checklist */}
      <div className="rounded-xl border border-malam-3 bg-malam-2 p-5">
        <div className="flex items-center justify-between border-b border-malam-3 pb-3">
          <div>
            <h3 className="text-base font-bold text-pasir">Daftar Tindakan Perbaikan Prioritas (Audit Fisik)</h3>
            <p className="text-xs text-redup">Rekomendasi teknis untuk dimasukkan ke Rencana Kerja dan Anggaran Sekolah (RKAS)</p>
          </div>
          <span className="rounded-full bg-malam-3 px-3 py-1 text-xs font-semibold text-redup">
            {recommendations.length} butir terdeteksi
          </span>
        </div>

        {recommendations.length === 0 ? (
          <div className="py-6 text-center text-sm text-redup">
            Belum ada data rekomendasi struktur.{" "}
            <Link href="/analisis" className="font-semibold text-fajar underline underline-offset-4">
              Unggah foto bangunan sekolah
            </Link>{" "}
            untuk memulai audit.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-malam-3/50 space-y-3">
            {recommendations.map((r, i) => (
              <li key={i} className="flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {r.priority === "segera" ? (
                    <AlertOctagon className="mt-0.5 size-4 shrink-0 text-bahaya" aria-hidden="true" />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-fajar" aria-hidden="true" />
                  )}
                  <div>
                    <p className="font-semibold text-pasir">{r.action}</p>
                    <p className="text-xs text-redup">
                      Estimasi Biaya: <strong className="text-pasir capitalize">{COST_LABEL[r.cost_band]}</strong>
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                    r.priority === "segera"
                      ? "bg-bahaya/20 text-bahaya"
                      : "bg-fajar/20 text-fajar"
                  }`}
                >
                  Prioritas {PRIORITY_LABEL[r.priority]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Official Audit Document Print Modal */}
      {printModal && (
        <div
          role="dialog"
          aria-labelledby="modal-laporan-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-malam/80 p-4 backdrop-blur-sm"
          onClick={() => setPrintModal(false)}
        >
          <div
            className="w-full max-w-2xl space-y-5 rounded-2xl border border-malam-3 bg-malam-2 p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b-2 border-pasir pb-4 text-center">
              <h4 id="modal-laporan-title" className="text-xl font-extrabold uppercase tracking-wide text-pasir">
                Laporan Kesiapsiagaan Bencana Sekolah
              </h4>
              <p className="text-sm font-semibold text-pasir">{school?.name ?? "Sekolah Terbuka"}</p>
              <p className="text-xs text-redup">Wilayah: {school?.region ?? "Indonesia"} · Dokumen Kesiapsiagaan Mandiri (Arunika)</p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-malam-3 bg-malam p-4">
                <div>
                  <span className="text-redup">Indeks Kesiapan Gabungan:</span>
                  <p className="text-2xl font-bold text-fajar">{readiness ?? "–"} / 100</p>
                </div>
                <div>
                  <span className="text-redup">Status Kelayakan:</span>
                  <p className="text-sm font-bold text-pasir">{status.label}</p>
                </div>
                <div>
                  <span className="text-redup">Skor Struktur Gedung:</span>
                  <p className="font-bold text-pasir">{structuralScore ?? "–"} / 100</p>
                </div>
                <div>
                  <span className="text-redup">Total Latihan Evakuasi Siswa:</span>
                  <p className="font-bold text-pasir">{totalDrills} sesi tercatat</p>
                </div>
              </div>

              <div>
                <p className="font-bold text-pasir mb-2">Tindakan Mitigasi Terjadwal:</p>
                <ol className="list-decimal pl-4 space-y-1 text-redup">
                  {recommendations.map((r, i) => (
                    <li key={i}>
                      <span className="text-pasir font-medium">{r.action}</span> (Prioritas: {PRIORITY_LABEL[r.priority]}, Biaya: {COST_LABEL[r.cost_band]})
                    </li>
                  ))}
                </ol>
              </div>

              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-malam-3 text-center">
                <div>
                  <p className="text-redup">Mengetahui,</p>
                  <p className="font-bold text-pasir mt-12">{me.profile.display_name}</p>
                  <p className="text-redup text-[11px]">Kepala Sekolah</p>
                </div>
                <div>
                  <p className="text-redup">Diverifikasi Oleh,</p>
                  <p className="font-bold text-pasir mt-12">(....................................)</p>
                  <p className="text-redup text-[11px]">Komite Sekolah / BPBD</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-malam-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-lg bg-fajar py-2.5 font-bold text-malam hover:bg-fajar-tua"
              >
                Cetak Lembar Laporan
              </button>
              <button
                type="button"
                onClick={() => setPrintModal(false)}
                className="rounded-lg border border-malam-3 px-5 py-2.5 font-semibold text-pasir hover:border-redup"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

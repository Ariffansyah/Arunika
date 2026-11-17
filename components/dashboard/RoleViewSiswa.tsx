"use client";

import { Award, CheckCircle2, ChevronRight, GraduationCap, Play, Printer, Shield, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Me } from "@/components/RequireAuth";
import { SCENARIO_LABEL, type Scenario } from "@/lib/sim";
import type { School } from "@/lib/supabase";

export type DrillRecord = {
  id: number;
  scenario: Scenario["kind"];
  score: number;
  time_s: number;
  reached: boolean;
  created_at: string;
};

export default function RoleViewSiswa({
  me,
  school,
  drills,
}: {
  me: Me;
  school: School | null;
  drills: DrillRecord[];
}) {
  const [printModal, setPrintModal] = useState(false);

  // Group by scenario: find highest score per scenario
  const scenarios: Scenario["kind"][] = ["gempa", "banjir", "angin", "longsor"];
  const stats = scenarios.map((sc) => {
    const list = drills.filter((d) => d.scenario === sc);
    const best = list.reduce((max, d) => (d.score > max.score ? d : max), { score: 0, time_s: 0, reached: false });
    const passed = best.score >= 750;
    return {
      kind: sc,
      label: SCENARIO_LABEL[sc],
      attempts: list.length,
      bestScore: list.length > 0 ? best.score : null,
      bestTime: list.length > 0 ? best.time_s : null,
      passed,
    };
  });

  const passedCount = stats.filter((s) => s.passed).length;
  const badge =
    passedCount >= 4
      ? { title: "Duta Siaga Bencana Teladan", color: "#f59e0b", desc: "Menguasai seluruh skenario evakuasi dengan standar BNPB." }
      : passedCount >= 2
        ? { title: "Kader Tangguh Bencana", color: "#38bdf8", desc: "Berhasil menyelesaikan beberapa simulasi evakuasi penting." }
        : passedCount >= 1
          ? { title: "Pelajar Waspada", color: "#34d399", desc: "Telah memahami dasar-dasar keselamatan dan mulai berlatih." }
          : { title: "Pelajar Siaga (Tahap Awal)", color: "#94a3b8", desc: "Mulai simulasi pertamamu untuk mendapatkan lencana kelulusan." };

  const averageScore =
    drills.length > 0 ? Math.round(drills.reduce((sum, d) => sum + d.score, 0) / drills.length) : 0;

  return (
    <div className="space-y-6">
      {/* Student Profile & Badge Banner */}
      <div className="flex flex-col gap-4 rounded-xl border border-malam-3 bg-malam-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-malam-3 border border-fajar/30 text-fajar">
            <GraduationCap className="size-8" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-pasir">{me.profile.display_name}</h2>
              <span className="rounded-full bg-fajar/20 px-2.5 py-0.5 text-xs font-semibold text-fajar">
                Siswa
              </span>
            </div>
            <p className="text-sm text-redup">
              {school ? `${school.name} · ${school.region}` : "Siswa Sekolah Mitra Arunika"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setPrintModal(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-malam-3 bg-malam px-4 text-sm font-semibold text-pasir hover:border-redup hover:text-white active:translate-y-px"
          >
            <Printer className="size-4" aria-hidden="true" />
            Cetak Kartu Prestasi
          </button>
          <Link
            href={`/kampus?room=${school?.id ?? "umum"}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-fajar px-5 text-sm font-semibold text-malam hover:bg-fajar-tua active:translate-y-px"
          >
            <Play className="size-4 fill-current" aria-hidden="true" />
            Latihan di Kampus
          </Link>
        </div>
      </div>

      {/* Competence & Progress Status */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-malam-3 bg-malam-2 p-4">
          <span className="text-xs font-medium text-redup">Lencana Kompetensi</span>
          <div className="mt-2 flex items-center gap-2.5">
            <Award className="size-6 shrink-0" style={{ color: badge.color }} aria-hidden="true" />
            <div>
              <p className="font-bold text-pasir">{badge.title}</p>
              <p className="text-xs text-redup">{badge.desc}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-malam-3 bg-malam-2 p-4">
          <span className="text-xs font-medium text-redup">Total Latihan Diselesaikan</span>
          <p className="mt-1 text-2xl font-extrabold text-pasir tabular-nums">
            {drills.length}{" "}
            <span className="text-sm font-normal text-redup">kali percobaan</span>
          </p>
          <p className="mt-1 text-xs text-redup">Rata-rata skor: {averageScore} / 1200 poin</p>
        </div>

        <div className="rounded-xl border border-malam-3 bg-malam-2 p-4">
          <span className="text-xs font-medium text-redup">Status Kelulusan Standar BNPB</span>
          <p className="mt-1 text-2xl font-extrabold text-pasir tabular-nums">
            {passedCount} / 4{" "}
            <span className="text-sm font-normal text-redup">skenario lulus</span>
          </p>
          <p className="mt-1 text-xs text-redup">Ambang kelulusan: minimal 750 poin per skenario</p>
        </div>
      </div>

      {/* 4 Disaster Scenarios Progress Cards */}
      <div>
        <h3 className="mb-3 text-lg font-bold text-pasir">Rapor Kesiapsiagaan Mandiri per Skenario</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.kind}
              className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
                s.passed
                  ? "border-aman/40 bg-aman/5"
                  : s.attempts > 0
                    ? "border-fajar/40 bg-fajar/5"
                    : "border-malam-3 bg-malam-2"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-redup">{s.label}</span>
                  {s.passed ? (
                    <CheckCircle2 className="size-5 text-aman" aria-hidden="true" />
                  ) : s.attempts > 0 ? (
                    <Shield className="size-5 text-fajar" aria-hidden="true" />
                  ) : (
                    <XCircle className="size-5 text-redup" aria-hidden="true" />
                  )}
                </div>

                <div className="mt-3">
                  <p className="text-2xl font-extrabold tabular-nums text-pasir">
                    {s.bestScore !== null ? s.bestScore : "–"}
                    {s.bestScore !== null && <span className="text-xs font-normal text-redup"> / 1200</span>}
                  </p>
                  <p className="text-xs text-redup">
                    {s.bestTime !== null ? `Waktu: ${s.bestTime.toFixed(1)} detik` : "Belum pernah dicoba"}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-malam-3/50 pt-3">
                <Link
                  href={`/kampus?room=${school?.id ?? "umum"}`}
                  className="flex items-center justify-between text-xs font-semibold text-fajar hover:underline"
                >
                  <span>{s.attempts > 0 ? "Latihan Ulang" : "Mulai Latihan"}</span>
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal / Cetak Kartu Prestasi */}
      {printModal && (
        <div
          role="dialog"
          aria-labelledby="modal-sertifikat-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-malam/80 p-4 backdrop-blur-sm"
          onClick={() => setPrintModal(false)}
        >
          <div
            className="w-full max-w-lg space-y-5 rounded-2xl border border-malam-3 bg-malam-2 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-malam-3 pb-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-fajar/20 text-fajar">
                <Award className="size-7" aria-hidden="true" />
              </div>
              <h4 id="modal-sertifikat-title" className="mt-3 text-xl font-extrabold text-pasir">
                Kartu Prestasi Siswa Siaga Bencana
              </h4>
              <p className="text-xs text-redup">Platform Arunika · Kesiapsiagaan Sekolah Indonesia</p>
            </div>

            <div className="rounded-xl border border-malam-3 bg-malam p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-redup">Nama Siswa:</span>
                <strong className="text-pasir">{me.profile.display_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-redup">Sekolah:</span>
                <strong className="text-pasir">{school?.name ?? "Sekolah Terbuka"}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-redup">Predikat:</span>
                <strong style={{ color: badge.color }}>{badge.title}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-redup">Kelulusan Skenario:</span>
                <strong className="text-pasir">{passedCount} dari 4 Skenario BNPB</strong>
              </div>
              <div className="flex justify-between border-t border-malam-3 pt-2">
                <span className="text-redup">Rata-rata Skor:</span>
                <strong className="text-fajar">{averageScore} / 1200 poin</strong>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-lg bg-fajar py-2.5 font-bold text-malam hover:bg-fajar-tua"
              >
                Cetak Dokumen
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

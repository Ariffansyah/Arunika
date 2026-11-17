"use client";

import { Check, Copy, Download, Share2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Me } from "@/components/RequireAuth";
import { SCENARIO_LABEL, type Scenario } from "@/lib/sim";
import type { School } from "@/lib/supabase";

export type SchoolDrillItem = {
  id: number;
  user_name: string;
  scenario: Scenario["kind"];
  score: number;
  time_s: number;
  reached: boolean;
  created_at: string;
};

export default function RoleViewGuru({
  me,
  school,
  drills,
}: {
  me: Me;
  school: School | null;
  drills: SchoolDrillItem[];
}) {
  const [copied, setCopied] = useState(false);

  const roomUrl = typeof window !== "undefined"
    ? `${window.location.origin}/kampus?room=${encodeURIComponent(school?.id ?? "umum")}`
    : `/kampus?room=${school?.id ?? "umum"}`;

  const copyRoomLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const exportCsv = () => {
    if (drills.length === 0) return;
    const headers = ["Waktu", "Nama Peserta", "Skenario", "Skor", "Waktu Evakuasi (dtk)", "Status"];
    const rows = drills.map((d) => [
      new Date(d.created_at).toLocaleDateString("id-ID"),
      `"${d.user_name.replace(/"/g, '""')}"`,
      `"${SCENARIO_LABEL[d.scenario]}"`,
      d.score,
      d.time_s.toFixed(1),
      d.reached ? "Berhasil Mencapai Titik Kumpul" : "Terhenti",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rekap-latihan-${school?.name.replace(/\s+/g, "-") || "sekolah"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const avgScore =
    drills.length > 0 ? Math.round(drills.reduce((sum, d) => sum + d.score, 0) / drills.length) : 0;
  const passedCount = drills.filter((d) => d.score >= 750).length;
  const passRate = drills.length > 0 ? Math.round((passedCount / drills.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Teacher Profile & Session Generator Banner */}
      <div className="flex flex-col gap-4 rounded-xl border border-malam-3 bg-malam-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-malam-3 border border-fajar/30 text-fajar">
            <Users className="size-8" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-pasir">{me.profile.display_name}</h2>
              <span className="rounded-full bg-aman/20 px-2.5 py-0.5 text-xs font-semibold text-aman">
                Guru Pembimbing
              </span>
            </div>
            <p className="text-sm text-redup">
              Pengelola Kelas Tanggap Bencana · {school?.name ?? "Sekolah Terbuka"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportCsv}
            disabled={drills.length === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-malam-3 bg-malam px-4 text-sm font-semibold text-pasir hover:border-redup disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden="true" />
            Ekspor Rekap Nilai (CSV)
          </button>
          <Link
            href={`/kampus?room=${school?.id ?? "umum"}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-fajar px-5 text-sm font-semibold text-malam hover:bg-fajar-tua"
          >
            <Share2 className="size-4" aria-hidden="true" />
            Masuk Sesi Kelas
          </Link>
        </div>
      </div>

      {/* Classroom Link Sharing Panel */}
      <div className="rounded-xl border border-fajar/30 bg-fajar/5 p-4 sm:p-5">
        <h3 className="text-base font-bold text-pasir">Tautan Ruangan Simulasi Bersama (Multiplayer Room)</h3>
        <p className="mt-1 text-xs text-redup">
          Bagikan tautan ini ke siswa Anda agar seluruh murid bergabung di kampus virtual yang sama. Anda dapat mengkoordinasikan simulasi evakuasi secara serentak.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            readOnly
            value={roomUrl}
            className="min-h-11 flex-1 rounded-lg border border-malam-3 bg-malam px-3 font-mono text-xs text-pasir select-all"
          />
          <button
            type="button"
            onClick={copyRoomLink}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-fajar px-5 text-sm font-bold text-malam hover:bg-fajar-tua"
          >
            {copied ? (
              <>
                <Check className="size-4" aria-hidden="true" />
                Tersalin!
              </>
            ) : (
              <>
                <Copy className="size-4" aria-hidden="true" />
                Salin Tautan
              </>
            )}
          </button>
        </div>
      </div>

      {/* Class Statistics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-malam-3 bg-malam-2 p-4">
          <span className="text-xs font-medium text-redup">Total Aktivitas Drill Kelas</span>
          <p className="mt-1 text-2xl font-extrabold text-pasir tabular-nums">
            {drills.length}{" "}
            <span className="text-sm font-normal text-redup">sesi selesai</span>
          </p>
          <p className="mt-1 text-xs text-redup">Tercatat di server sekolah</p>
        </div>

        <div className="rounded-xl border border-malam-3 bg-malam-2 p-4">
          <span className="text-xs font-medium text-redup">Rata-rata Nilai Siswa</span>
          <p className="mt-1 text-2xl font-extrabold text-pasir tabular-nums">
            {avgScore}{" "}
            <span className="text-sm font-normal text-redup">/ 1200 poin</span>
          </p>
          <p className="mt-1 text-xs text-redup">Standar minimal kelulusan BNPB: 750 poin</p>
        </div>

        <div className="rounded-xl border border-malam-3 bg-malam-2 p-4">
          <span className="text-xs font-medium text-redup">Tingkat Kelulusan Kelas</span>
          <p className="mt-1 text-2xl font-extrabold text-pasir tabular-nums">
            {passRate}%{" "}
            <span className="text-sm font-normal text-redup">({passedCount} sesi lulus)</span>
          </p>
          <p className="mt-1 text-xs text-redup">Berdasarkan kepatuhan prosedur evakuasi</p>
        </div>
      </div>

      {/* Recent Drill Activity Table */}
      <div className="rounded-xl border border-malam-3 bg-malam-2 p-4">
        <h3 className="mb-3 text-base font-bold text-pasir">Riwayat Aktivitas Siswa Terkini</h3>
        {drills.length === 0 ? (
          <p className="py-6 text-center text-sm text-redup">Belum ada catatan latihan siswa di sekolah ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-malam-3 text-redup">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Waktu</th>
                  <th className="py-2 pr-4 font-semibold">Nama Siswa</th>
                  <th className="py-2 pr-4 font-semibold">Skenario</th>
                  <th className="py-2 pr-4 font-semibold text-right">Skor</th>
                  <th className="py-2 pr-4 font-semibold text-right">Waktu</th>
                  <th className="py-2 font-semibold">Hasil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-malam-3/50">
                {drills.slice(0, 8).map((d) => (
                  <tr key={d.id} className="hover:bg-malam-3/30">
                    <td className="py-2.5 pr-4 text-redup">
                      {new Date(d.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-pasir">{d.user_name}</td>
                    <td className="py-2.5 pr-4 text-redup">{SCENARIO_LABEL[d.scenario]}</td>
                    <td className="py-2.5 pr-4 text-right font-bold tabular-nums text-fajar">{d.score}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-redup">{d.time_s.toFixed(1)}s</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          d.reached ? "bg-aman/20 text-aman" : "bg-bahaya/20 text-bahaya"
                        }`}
                      >
                        {d.reached ? "Tuntas" : "Gagal"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

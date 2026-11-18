"use client";

import { Check, CircleCheck, Copy, OctagonX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Me } from "@/components/RequireAuth";
import { SCENARIO_LABEL, type Scenario } from "@/lib/sim";
import type { School } from "@/lib/supabase";
import { Facts, primaryBtn, secondaryBtn } from "./ui";

export type SchoolDrillItem = {
  id: number;
  user_name: string;
  scenario: Scenario["kind"];
  score: number;
  time_s: number;
  reached: boolean;
  created_at: string;
};

const PASS = 750;

export default function RoleViewGuru({ me, school, drills }: { me: Me; school: School | null; drills: SchoolDrillItem[] }) {
  const [copied, setCopied] = useState(false);
  const room = `/sekolah?room=${encodeURIComponent(school?.id ?? "umum")}`;
  const roomUrl = typeof window !== "undefined" ? `${window.location.origin}${room}` : room;

  const copyRoomLink = () => {
    navigator.clipboard?.writeText(roomUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
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
      d.reached ? "Sampai titik kumpul" : "Terhenti",
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `rekap-latihan-${school?.name.replace(/\s+/g, "-") || "sekolah"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const avgScore = drills.length ? Math.round(drills.reduce((sum, d) => sum + d.score, 0) / drills.length) : null;
  const passedCount = drills.filter((d) => d.score >= PASS).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="max-w-[26ch] text-3xl font-extrabold tracking-tight sm:text-4xl">
          {drills.length
            ? `${passedCount} dari ${drills.length} latihan terakhir di ${school?.name ?? "sekolahmu"} lulus.`
            : `Belum ada latihan di ${school?.name ?? "sekolahmu"}.`}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link href={room} className={primaryBtn}>
            Masuk ruang kelas
          </Link>
          <button type="button" onClick={exportCsv} disabled={drills.length === 0} className={secondaryBtn}>
            Ekspor CSV
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          <label htmlFor="room-url" className="block text-lg font-bold">
            Tautan ruang latihan bersama
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="room-url"
              type="text"
              readOnly
              value={roomUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 flex-1 rounded-md border border-malam-3 bg-malam-2 px-3 text-pasir"
            />
            <button type="button" onClick={copyRoomLink} className={`${primaryBtn} justify-center`}>
              {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
              {copied ? "Tersalin" : "Salin"}
            </button>
          </div>
          <p className="text-redup">Siswa yang membuka tautan ini masuk ke sekolah yang sama denganmu, jadi evakuasinya serentak.</p>
        </div>
        <Facts
          items={[
            ["Guru", me.profile.display_name],
            ["Rata-rata skor", avgScore === null ? "Belum ada" : `${avgScore} dari 1200`],
            ["Batas lulus", `${PASS} poin`],
          ]}
        />
      </div>

      <div>
        <h3 className="text-xl font-bold">Latihan terbaru</h3>
        {drills.length === 0 ? (
          <p className="mt-3 text-redup">Bagikan tautan ruang di atas agar latihan siswa tercatat di sini.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-malam-3">
            <table className="w-full min-w-[36rem] text-left">
              <thead className="border-b border-malam-3 text-redup">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Siswa</th>
                  <th scope="col" className="px-4 py-3 font-medium">Skenario</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Skor</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Waktu</th>
                  <th scope="col" className="px-4 py-3 font-medium">Hasil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-malam-3">
                {drills.slice(0, 10).map((d) => (
                  <tr key={d.id}>
                    <th scope="row" className="px-4 py-3 font-semibold">{d.user_name}</th>
                    <td className="px-4 py-3 text-redup">{SCENARIO_LABEL[d.scenario]}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.score}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-redup">{d.time_s.toFixed(1)} dtk</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {d.reached ? (
                          <CircleCheck aria-hidden="true" className="size-4 text-aman" />
                        ) : (
                          <OctagonX aria-hidden="true" className="size-4 text-bahaya" />
                        )}
                        {d.reached ? "Sampai titik kumpul" : "Terhenti"}
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

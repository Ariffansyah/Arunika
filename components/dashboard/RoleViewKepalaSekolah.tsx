"use client";

import { OctagonAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Me } from "@/components/RequireAuth";
import { COST_LABEL, PRIORITY_LABEL, type Recommendation } from "@/lib/assessment";
import type { School } from "@/lib/supabase";
import { Facts, Meter, PrintSheet, primaryBtn, secondaryBtn, statusOf } from "./ui";

export default function RoleViewKepalaSekolah({
  me,
  school,
  readiness,
  gladiScore,
  drillScore,
  totalDrills,
  recommendations,
}: {
  me: Me;
  school: School | null;
  readiness: number | null;
  gladiScore: number | null;
  drillScore: number | null;
  totalDrills: number;
  recommendations: Recommendation[];
}) {
  const [printing, setPrinting] = useState(false);
  const status = statusOf(readiness);
  const name = school?.name ?? "Sekolahmu";
  const drill = drillScore === null ? null : Math.min(100, Math.round(drillScore / 10));
  const link = (href: string, text: string) => (
    <Link href={href} className="text-langit underline decoration-langit/40 underline-offset-4 hover:decoration-langit">
      {text}
    </Link>
  );

  const actions = (
    <ol className="divide-y divide-malam-3 rounded-lg border border-malam-3 bg-malam-2">
      {recommendations.map((r) => (
        <li key={r.action} className="flex gap-3 p-4 leading-relaxed">
          {r.priority === "segera" ? (
            <OctagonAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-bahaya" />
          ) : (
            <TriangleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-fajar" />
          )}
          <span>
            {r.action}{" "}
            <span className="text-redup">
              ({PRIORITY_LABEL[r.priority].toLowerCase()}, {COST_LABEL[r.cost_band].toLowerCase()})
            </span>
          </span>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="max-w-[26ch] text-3xl font-extrabold tracking-tight sm:text-4xl">
          {readiness === null ? (
            `${name} belum punya indeks kesiapan.`
          ) : (
            <>
              Kesiapan {name} <span style={{ color: status.color }}>{readiness}</span> dari 100. {status.label}.
            </>
          )}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/gladi" className={primaryBtn}>
            Mulai gladi ruang
          </Link>
          <button type="button" onClick={() => setPrinting(true)} className={secondaryBtn}>
            Cetak laporan
          </button>
        </div>
      </div>

      <div className="grid gap-x-12 gap-y-6 rounded-lg border border-malam-3 bg-malam-2 p-5 sm:grid-cols-2 sm:p-6">
        <Meter label="Kesiapan siswa dari latihan kampus" value={drill} max={100} href={link(`/kampus?room=${school?.id ?? "umum"}`, "Mulai latihan")} />
        <Meter label="Kesiapan tim siaga dari gladi ruang" value={gladiScore} max={100} href={link("/gladi", "Mulai gladi")} />
      </div>

      <div>
        <h3 className="text-xl font-bold">Rencana tindak lanjut untuk RKAS</h3>
        {recommendations.length === 0 ? (
          <p className="mt-3 text-redup">
            Belum ada. {link("/gladi", "Jalankan gladi ruang")} dan AI menyusun perbaikan rencana siaga sekolah dari keputusan tim.
          </p>
        ) : (
          <div className="mt-4">{actions}</div>
        )}
      </div>

      {printing && (
        <PrintSheet title={`Laporan kesiapsiagaan ${name}`} onClose={() => setPrinting(false)}>
          <Facts
            items={[
              ["Wilayah", school?.region ?? "Indonesia"],
              ["Indeks kesiapan", readiness === null ? "Belum ada" : `${readiness} dari 100, ${status.label.toLowerCase()}`],
              ["Skor gladi ruang", gladiScore === null ? "Belum ada" : `${gladiScore} dari 100`],
              ["Latihan evakuasi siswa", `${totalDrills} kali`],
              ["Disusun oleh", `${me.profile.display_name}, kepala sekolah`],
            ]}
          />
          {recommendations.length > 0 && actions}
          <div className="grid grid-cols-2 gap-8 pt-6 text-center">
            <p>
              Mengetahui,
              <span className="mt-14 block font-bold">{me.profile.display_name}</span>
            </p>
            <p>
              Diverifikasi oleh,
              <span className="mt-14 block font-bold">Komite sekolah / BPBD</span>
            </p>
          </div>
        </PrintSheet>
      )}
    </div>
  );
}

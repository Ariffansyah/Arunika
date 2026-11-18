"use client";

import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HAZARD_ICON } from "@/components/hazards";
import type { Me } from "@/components/RequireAuth";
import { num } from "@/lib/format";
import { SCENARIO_LABEL, type Scenario } from "@/lib/sim";
import { avatarOf, type School } from "@/lib/supabase";
import { Facts, PrintSheet, primaryBtn, secondaryBtn } from "./ui";

export type DrillRecord = {
  id: number;
  scenario: Scenario["kind"];
  score: number;
  time_s: number;
  reached: boolean;
  created_at: string;
};

const PASS = 750;
const SCENARIOS: Scenario["kind"][] = ["gempa", "banjir", "angin", "longsor"];

export default function RoleViewSiswa({ me, school, drills }: { me: Me; school: School | null; drills: DrillRecord[] }) {
  const [printing, setPrinting] = useState(false);

  const stats = SCENARIOS.map((kind) => {
    const list = drills.filter((d) => d.scenario === kind);
    const best = list.reduce<DrillRecord | null>((b, d) => (!b || d.score > b.score ? d : b), null);
    return { kind, attempts: list.length, best, passed: (best?.score ?? 0) >= PASS };
  });
  const passed = stats.filter((s) => s.passed).length;
  const title =
    passed >= 4 ? "Duta Siaga Bencana" : passed >= 2 ? "Kader Tangguh Bencana" : passed >= 1 ? "Pelajar Waspada" : "Pelajar Siaga";
  const average = drills.length ? Math.round(drills.reduce((s, d) => s + d.score, 0) / drills.length) : null;
  const room = `/sekolah?room=${school?.id ?? "umum"}`;

  const facts: [string, React.ReactNode][] = [
    ["Predikat", title],
    ["Sekolah", school?.name ?? "Belum terhubung"],
    ["Latihan selesai", `${drills.length} kali`],
    ["Rata-rata skor", average === null ? "Belum ada" : `${num(average)} dari ${num(1200)}`],
    ["Batas lulus", `${PASS} dari ${num(1200)}`],
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- 128px sprites, nothing to optimise */}
          <img
            src={`/characters/previews/${avatarOf(me.profile.avatar)}.png`}
            alt=""
            width={64}
            height={64}
            className="size-16 shrink-0 rounded-full border-2 border-laut bg-malam-2 sm:size-20"
          />
          <h2 className="max-w-[24ch] text-3xl font-extrabold tracking-tight sm:text-4xl">
            {me.profile.display_name} lulus {passed} dari 4 skenario.
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={room} className={primaryBtn}>
            Latihan evakuasi
          </Link>
          <button type="button" onClick={() => setPrinting(true)} className={secondaryBtn}>
            Cetak kartu prestasi
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul aria-label="Rapor latihan per skenario" className="grid gap-3 sm:grid-cols-2">
          {stats.map((s) => {
            const Icon = HAZARD_ICON[s.kind];
            return (
              <li key={s.kind} className="space-y-3 rounded-lg border border-malam-3 bg-malam-2 shadow-edge p-4">
                <p className="flex items-center gap-3 text-lg font-bold">
                  <Icon aria-hidden="true" className="size-5 shrink-0 text-langit" />
                  <span className="flex-1">{SCENARIO_LABEL[s.kind]}</span>
                  <span className="tabular-nums">{s.best?.score ?? "–"}</span>
                </p>
                {/* The tick marks the pass score. */}
                <div aria-hidden="true" className="relative h-2 rounded-full bg-malam-3">
                  {s.best && (
                    <div
                      className={`h-full origin-left rounded-full motion-safe:animate-grow ${s.passed ? "bg-aman" : "bg-langit"}`}
                      style={{ width: `${Math.min(100, (s.best.score / 1200) * 100)}%` }}
                    />
                  )}
                  <span className="absolute -inset-y-1 w-0.5 rounded-full bg-pasir/70" style={{ left: `${(PASS / 1200) * 100}%` }} />
                </div>
                <p className="flex items-center gap-1.5">
                  {s.passed ? (
                    <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-aman" />
                  ) : s.attempts ? (
                    <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-fajar" />
                  ) : (
                    <CircleDashed aria-hidden="true" className="size-4 shrink-0 text-redup" />
                  )}
                  <span className="flex-1">{s.passed ? "Lulus" : s.attempts ? `Belum lulus, ${s.attempts}× dicoba` : "Belum dicoba"}</span>
                  {s.best && <span className="tabular-nums text-redup">{num(s.best.time_s, 1)} dtk</span>}
                </p>
              </li>
            );
          })}
        </ul>
        <Facts items={facts} />
      </div>

      {printing && (
        <PrintSheet title="Kartu prestasi siswa siaga bencana" onClose={() => setPrinting(false)}>
          <Facts items={[["Nama", me.profile.display_name], ...facts, ["Skenario lulus", `${passed} dari 4`]]} />
        </PrintSheet>
      )}
    </div>
  );
}

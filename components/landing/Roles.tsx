"use client";

import { ArrowRight, Building2, CircleCheck, GraduationCap, Landmark, OctagonAlert, OctagonX, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Meter, StatusLabel, statusOf } from "@/components/dashboard/ui";
import { HAZARD_ICON } from "@/components/hazards";
import { HAZARD_LABEL, type Hazard } from "@/lib/gladi";
import { ROLE_LABEL, type Role } from "@/lib/supabase";

const ICONS = { siswa: GraduationCap, guru: Users, kepala_sekolah: Building2, pemda: Landmark };
const ROLES = Object.keys(ICONS) as Role[];
const PASS = 750;

// Example rows in the shape of each dashboard view; the school names are the demo schools in the dashboard.
const REPORT: [Hazard, number][] = [
  ["gempa", 1010],
  ["banjir", 920],
  ["angin", 780],
  ["longsor", 640],
];
const CLASS: [string, Hazard, number, boolean][] = [
  ["Rani", "gempa", 1010, true],
  ["Bayu", "banjir", 640, false],
  ["Sekar", "angin", 860, true],
  ["Dimas", "longsor", 790, true],
];
const REGION: [string, number][] = [
  ["SD Muara Segara", 38],
  ["SMP Rinjani Timur", 58],
  ["SD Pesisir Fajar", 60],
  ["SD Rob Utara", 82],
];
const regionAvg = Math.round(REGION.reduce((s, [, r]) => s + r, 0) / REGION.length);

const big = "text-2xl leading-tight font-extrabold tracking-tight sm:text-4xl";
const row = "flex items-center gap-3 border-b border-malam-3 py-3 last:border-0";

function View({ role }: { role: Role }) {
  if (role === "siswa")
    return (
      <>
        <p className={big}>Rani lulus {REPORT.filter(([, s]) => s >= PASS).length} dari 4 skenario.</p>
        <ul>
          {REPORT.map(([k, score]) => {
            const Icon = HAZARD_ICON[k];
            return (
              <li key={k} className={row}>
                <Icon aria-hidden="true" className="size-5 shrink-0 text-langit" />
                <span className="min-w-0 flex-1 font-semibold sm:w-48 sm:flex-none">{HAZARD_LABEL[k]}</span>
                <span aria-hidden="true" className="relative h-2 w-16 shrink-0 rounded-full bg-malam-3 sm:w-auto sm:flex-1">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-langit" style={{ width: `${(score / 1200) * 100}%` }} />
                  <span className="absolute -inset-y-1 w-0.5 bg-pasir/60" style={{ left: `${(PASS / 1200) * 100}%` }} />
                </span>
                <span className="w-14 text-right font-bold tabular-nums">{score}</span>
                {score >= PASS ? (
                  <CircleCheck aria-label="Lulus" className="size-5 shrink-0 text-aman" />
                ) : (
                  <OctagonX aria-label="Belum lulus" className="size-5 shrink-0 text-fajar" />
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  if (role === "guru")
    return (
      <>
        <p className={big}>
          {CLASS.filter((c) => c[3]).length} dari {CLASS.length} latihan terakhir di SMP Teluk Harapan lulus.
        </p>
        <ul>
          {CLASS.map(([name, k, score, ok]) => (
            <li key={name} className={row}>
              <span className="w-20 shrink-0 font-semibold">{name}</span>
              <span className="flex-1 text-redup">{HAZARD_LABEL[k]}</span>
              <span className="font-bold tabular-nums">{score}</span>
              {ok ? (
                <CircleCheck aria-label="Sampai titik kumpul" className="size-5 shrink-0 text-aman" />
              ) : (
                <OctagonX aria-label="Terhenti" className="size-5 shrink-0 text-bahaya" />
              )}
            </li>
          ))}
        </ul>
      </>
    );
  if (role === "kepala_sekolah") {
    const s = statusOf(60);
    return (
      <>
        <p className={big}>
          Kesiapan SD Pesisir Fajar <span style={{ color: s.color }}>60</span> dari 100. {s.label}.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Meter label="Latihan evakuasi siswa" value={81} max={100} />
          <Meter label="Gladi ruang tim siaga" value={38} max={100} />
        </div>
        <p className="flex gap-3 rounded-lg border border-malam-3 bg-malam p-4 leading-relaxed">
          <OctagonAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-bahaya" />
          <span>
            Tambahkan kolom praktis dan balok ring pada dinding bata kelas <span className="text-redup">(segera, biaya sedang)</span>
          </span>
        </p>
      </>
    );
  }
  return (
    <>
      <p className={big}>
        {REGION.filter(([, r]) => r < 45).length} dari {REGION.length} sekolah rawan. Rata-rata kesiapan {regionAvg}.
      </p>
      <ul>
        {REGION.map(([name, r]) => (
          <li key={name} className={row}>
            <span className="flex-1 font-semibold">{name}</span>
            <span className="hidden sm:inline">
              <StatusLabel readiness={r} />
            </span>
            <span aria-hidden="true" className="h-2 w-16 rounded-full bg-malam-3 sm:w-28">
              <span className="block h-full rounded-full" style={{ width: `${r}%`, background: statusOf(r).color }} />
            </span>
            <span className="w-8 text-right font-bold tabular-nums">{r}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Roles() {
  const [role, setRole] = useState<Role>("siswa");
  return (
    <section aria-labelledby="pantau" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <h2 id="pantau" className="max-w-[16ch] text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
        Satu data, dari siswa sampai pemda.
      </h2>
      <div className="mt-14 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <fieldset>
          <legend className="sr-only">Peran</legend>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {ROLES.map((r) => {
              const Icon = ICONS[r];
              return (
                <label
                  key={r}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-malam-3 px-4 font-bold sm:text-lg text-redup transition-colors hover:border-redup hover:text-pasir has-checked:border-laut has-checked:bg-laut has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-langit lg:min-h-18 lg:text-xl"
                >
                  <input type="radio" name="landing-role" className="sr-only" checked={role === r} onChange={() => setRole(r)} />
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  {ROLE_LABEL[r]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-6 rounded-2xl border border-malam-3 bg-malam-2 p-5 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)] sm:p-8">
          <div key={role} className="flex animate-rise flex-col gap-6">
            <View role={role} />
          </div>
          <Link href="/dashboard" className="group mt-auto inline-flex min-h-11 items-center gap-2 self-start text-lg font-bold text-langit">
            Buka dasbor {ROLE_LABEL[role].toLowerCase()}
            <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}

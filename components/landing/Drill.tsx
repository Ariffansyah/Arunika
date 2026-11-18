"use client";

import { ArrowRight, Link2, Mic, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import CampusPlan from "@/components/CampusPlan";
import { ASSEMBLY, ASSEMBLY_NAMES, GRID, SPAWN, TILE, findTiles, tileAt } from "@/lib/campus";
import { num } from "@/lib/format";
import { WALK_SPEED, bestRoute, pathLength } from "@/lib/sim";
import { AVATARS } from "@/lib/supabase";

const CLASS = ["Rani", "Bayu", "Sekar", "Dimas", "Ayu", "Nina"];

// Example answers in the shape the warden's prompt asks for: short, plain, and in BNPB's order.
const ASK = [
  {
    chip: "Gempa di kelas",
    q: "Kalau gempa terjadi saat di kelas, aku harus apa?",
    a: "Merunduk, lindungi kepala, bertahan: masuk ke bawah meja dan pegang kakinya sampai guncangan berhenti. Jauhi jendela dan lemari. Setelah berhenti, berjalan tertib lewat jalur evakuasi ke titik kumpul.",
  },
  {
    chip: "Lutut lecet",
    q: "Bagaimana menolong teman yang lututnya lecet?",
    a: "Cuci tangan dulu, lalu bilas lukanya dengan air bersih mengalir. Kalau berdarah, tekan pelan dengan kain bersih. Tutup dengan plester atau kasa, lalu beri tahu guru atau petugas UKS.",
  },
  {
    chip: "Tas siaga",
    q: "Apa saja isi tas siaga bencana?",
    a: "Air minum, makanan tahan lama, senter dan baterai, peluit, kotak P3K, obat pribadi, masker, salinan dokumen penting, dan baju ganti. Simpan di tempat yang mudah diambil saat harus keluar cepat.",
  },
];

// A first drill as it often goes: out to the gate, then back across the school to the assembly point.
const none = new Set<number>();
const best = bestRoute(GRID, SPAWN, ASSEMBLY, none) ?? [SPAWN];
const goal = best.at(-1)!;
const gate = findTiles("G")[0];
const trail = [...(bestRoute(GRID, SPAWN, [gate], none) ?? []), ...(bestRoute(GRID, gate, [goal], none) ?? []).slice(1)];
const bestM = Math.round(pathLength(best) * TILE);
const trailM = Math.round(pathLength(trail) * TILE);
const centre = (t: [number, number][]) => t.map(([x, z]) => `${x + 0.5},${z + 0.5}`).join(" ");

const card = "rounded-2xl border border-malam-3 bg-malam-2 p-5 sm:p-7";
const cardTitle = "text-2xl leading-snug font-extrabold tracking-tight sm:text-3xl";

export default function Drill() {
  const [ask, setAsk] = useState(0);

  return (
    <section aria-labelledby="bersama" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <h2 id="bersama" className="max-w-[18ch] text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
        Sekelas evakuasi bersama, dinilai sampai titik kumpul.
      </h2>

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        <article aria-labelledby="jejak" className={`${card} reveal grid gap-6 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-10`}>
          <div className="self-start overflow-hidden rounded-xl border border-malam-3 lg:order-last">
            <CampusPlan labels={1.2} route={best} label="Contoh jejak evakuasi seorang siswa yang memutar lewat gerbang, dan rute terbaik ke titik kumpul">
              <polyline
                points={centre(trail)}
                pathLength={1}
                className="draw"
                fill="none"
                stroke="#3d7bf5"
                strokeWidth={0.7}
                strokeOpacity={0.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={SPAWN[0] + 0.5} cy={SPAWN[1] + 0.5} r={0.7} fill="#3d7bf5" stroke="#071530" strokeWidth={0.2} />
            </CampusPlan>
          </div>
          <div className="flex flex-col gap-6 lg:py-2">
            <h3 id="jejak" className={cardTitle}>
              Jejakmu dibandingkan dengan rute terbaik.
            </h3>
            <dl className="text-lg">
              {[
                ["Jejakmu", `${trailM} m`],
                ["Rute terbaik", `${bestM} m`],
                ["Efisiensi", `${Math.round((bestM / trailM) * 100)}%`],
                ["Waktu jalan", `${num(trailM / WALK_SPEED, 0)} detik`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-malam-3 py-3">
                  <dt className="text-redup">{k}</dt>
                  <dd className="font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-auto flex flex-wrap gap-x-6 gap-y-2">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-7 rounded-full bg-laut-terang" />
                Jejakmu
              </span>
              <span className="inline-flex items-center gap-2">
                <svg aria-hidden="true" width="28" height="6" viewBox="0 0 28 6">
                  <line x1="2" y1="3" x2="26" y2="3" stroke="#ff8a3d" strokeWidth="4" strokeDasharray="6 4" strokeLinecap="round" />
                </svg>
                Rute ke {ASSEMBLY_NAMES[tileAt(...goal)]}
              </span>
            </p>
          </div>
        </article>

        <article aria-labelledby="sekelas" className={`${card} reveal flex flex-col gap-6`}>
          <h3 id="sekelas" className={cardTitle}>
            Satu tautan, satu kelas evakuasi serentak.
          </h3>
          <ul className="grid grid-cols-3 gap-2">
            {AVATARS.map((look, i) => (
              <li key={look} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- 128px sprites, nothing to optimise */}
                <img src={`/characters/previews/${look}.png`} alt="" width={128} height={128} loading="lazy" className="aspect-square w-full rounded-xl bg-malam" />
                <span className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1.5 rounded-md bg-malam/85 py-0.5 font-semibold">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-langit" />
                  {CLASS[i]}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/sekolah?room=umum"
            className="group flex min-h-13 items-center gap-3 rounded-lg border border-malam-3 bg-malam px-4 font-semibold transition-colors hover:border-laut"
          >
            <Link2 aria-hidden="true" className="size-5 shrink-0 text-langit" />
            <span className="flex-1">Masuk ruang umum</span>
            <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </article>

        <article aria-labelledby="petugas" className={`${card} reveal flex flex-col gap-5`}>
          <h3 id="petugas" className={cardTitle}>
            Petugas AI menjawab, lewat suara pun bisa.
          </h3>
          <div role="group" aria-label="Contoh pertanyaan" className="flex flex-wrap gap-2">
            {ASK.map((x, i) => (
              <button
                key={x.chip}
                type="button"
                aria-pressed={ask === i}
                onClick={() => setAsk(i)}
                className="min-h-11 rounded-full border border-malam-3 px-4 font-semibold text-redup transition-colors hover:text-pasir aria-pressed:border-laut aria-pressed:bg-laut aria-pressed:text-white"
              >
                {x.chip}
              </button>
            ))}
          </div>
          <div key={ask} aria-live="polite" className="space-y-3 leading-relaxed">
            <p className="ml-auto w-fit max-w-[88%] animate-rise rounded-2xl rounded-br-md bg-laut px-4 py-2.5 text-white">{ASK[ask].q}</p>
            <div className="flex animate-rise gap-3 [animation-delay:200ms]">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-aman/15 text-aman">
                <ShieldCheck className="size-5" />
              </span>
              <p className="rounded-2xl rounded-tl-md bg-malam px-4 py-2.5">
                <span className="sr-only">Petugas AI: </span>
                {ASK[ask].a}
              </p>
            </div>
          </div>
          <Link
            href="/sekolah"
            className="group mt-auto flex min-h-13 items-center gap-3 rounded-full border border-malam-3 bg-malam pr-2 pl-5 font-semibold transition-colors hover:border-laut"
          >
            <span className="flex-1 text-redup group-hover:text-pasir">Tanya Petugas AI</span>
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-laut text-white">
              <Mic className="size-5" />
            </span>
          </Link>
        </article>
      </div>
    </section>
  );
}

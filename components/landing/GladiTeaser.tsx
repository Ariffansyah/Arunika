import { ArrowRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { latestQuake } from "@/lib/bmkg";
import { quakeLine } from "@/lib/gladi";

// How a gladi reads, step by step; the quake above it is live from BMKG.
const LOG = [
  { at: "09.12", text: "Guncangan berhenti. Listrik padam, tangga timur retak, dan 32 siswa kelas 8B masih di lantai 2." },
  { at: "Anda", text: "Turunkan 8B lewat tangga barat. Guru piket menjaga tangga timur agar tidak dilewati." },
  { at: "AI", text: "Tepat. Tangga yang retak jangan dilewati. Lalu siapa yang menghitung siswa di titik kumpul?" },
  { at: "09.19", text: "Orang tua berdatangan ke gerbang, dan kabar gedung roboh beredar di grup kelas." },
];

export default async function GladiTeaser() {
  const quake = await latestQuake();
  return (
    <section
      aria-labelledby="gladi"
      className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-center lg:gap-16 lg:py-32"
    >
      <div className="flex flex-col items-start gap-10">
        <h2 id="gladi" className="max-w-[13ch] text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
          Tim siaga sekolah berlatih dari gempa sungguhan.
        </h2>
        <Link
          href="/gladi"
          className="group inline-flex min-h-14 items-center gap-3 rounded-md bg-laut px-7 text-lg font-bold text-white shadow-[0_14px_40px_-12px_rgb(30_99_240/0.7)] hover:bg-laut-terang active:translate-y-px"
        >
          Mulai gladi ruang
          <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
      <figure className="overflow-hidden rounded-xl border border-malam-3 bg-malam-2">
        {quake && (
          <figcaption className="flex items-start gap-3 border-b border-malam-3 px-5 py-4 leading-relaxed">
            <span aria-hidden="true" className="mt-2 size-2 shrink-0 animate-pulse rounded-full bg-langit" />
            <span>
              <strong>Gempa terkini BMKG</strong> <span className="text-redup">{quakeLine(quake)}</span>
            </span>
          </figcaption>
        )}
        <ol className="space-y-5 p-5 sm:p-6">
          {LOG.map(({ at, text }, i) => (
            <li
              key={at}
              style={{ "--delay": `${i * 10}%` } as CSSProperties}
              className="reveal grid grid-cols-[3.75rem_1fr] items-start gap-3 leading-relaxed"
            >
              <span className={`pt-0.5 font-extrabold tabular-nums ${at === "Anda" ? "text-pasir" : at === "AI" ? "text-aman" : "text-langit"}`}>
                {at}
              </span>
              {at === "Anda" ? (
                <p className="rounded-md bg-laut/20 px-3 py-2">{text}</p>
              ) : at === "AI" ? (
                <p className="flex gap-2">
                  <CircleCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-aman" />
                  {text}
                </p>
              ) : (
                <p>{text}</p>
              )}
            </li>
          ))}
        </ol>
      </figure>
    </section>
  );
}

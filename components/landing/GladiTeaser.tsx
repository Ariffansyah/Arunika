import { ArrowRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { latestQuake } from "@/lib/bmkg";
import { quakeLine } from "@/lib/gladi";
import QuakeMap from "./QuakeMap";

// How a gladi reads, step by step: the AI writes and judges the situations, the campus engine judges the map moves.
// The quake above it is live from BMKG.
const LOG = [
  { at: "09.12", text: "Lantai kelas 9B di Gedung Kelas B bergetar keras dan lampu berayun." },
  { at: "Anda", text: "Masuk ke bawah meja, lindungi kepala, pegang kaki meja." },
  { at: "Peta", text: "Gedung Kelas A paling rawan runtuh, 78%. Rute ke Lapangan 51 m, aman." },
  { at: "09.24", text: "Di Lapangan, absen kurang 3 siswa dan orang tua mulai berdatangan." },
];
// The four steps of the example above, coloured by verdict as on the gladi page.
const VERDICTS = ["bg-aman", "bg-aman", "bg-fajar", "bg-aman"];

export default async function GladiTeaser() {
  const quake = await latestQuake();
  return (
    <section aria-labelledby="gladi" className="grain border-y border-malam-3 bg-malam-2">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-center lg:gap-16 lg:py-32">
        <div className="flex flex-col items-start gap-10">
          <h2 id="gladi" className="max-w-[13ch] text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Tim siaga sekolah berlatih dari gempa sungguhan.
          </h2>
          <Link
            href="/gladi"
            className="group inline-flex min-h-14 items-center gap-3 rounded-md bg-laut px-7 text-lg font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22)] transition-colors hover:bg-laut-terang active:translate-y-px"
          >
            Mulai gladi ruang
            <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <QuakeMap quake={quake} />
        </div>
        <figure className="track overflow-hidden rounded-lg border border-malam-3 bg-malam shadow-edge">
          {quake && (
            <figcaption className="flex items-start gap-3 border-b border-malam-3 px-5 py-4 leading-relaxed">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 animate-pulse rounded-full bg-langit" />
              <span>
                <strong>Gempa terkini BMKG</strong> <span className="text-redup">{quakeLine(quake)}</span>
              </span>
            </figcaption>
          )}
          {/* Each verdict fills as its step scrolls in, on the same delays as the log below. */}
          <ol aria-hidden="true" className="flex gap-1.5 px-5 pt-5 sm:px-6">
            {VERDICTS.map((v, i) => (
              <li key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-malam-3">
                <span className={`fill-in block h-full ${v}`} style={{ "--delay": `${i * 10}%` } as CSSProperties} />
              </li>
            ))}
          </ol>
          <ol className="space-y-5 p-5 sm:p-6">
            {LOG.map(({ at, text }, i) => (
              <li
                key={at}
                style={{ "--delay": `${i * 10}%` } as CSSProperties}
                className="reveal grid grid-cols-[3.75rem_1fr] items-start gap-3 leading-relaxed"
              >
                <span className={`pt-0.5 font-mono font-bold ${at === "Anda" ? "text-pasir" : at === "Peta" ? "text-fajar" : "text-langit"}`}>
                  {at}
                </span>
                {at === "Anda" ? (
                  <p className="rounded-md bg-laut/20 px-3 py-2">{text}</p>
                ) : at === "Peta" ? (
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
          <p className="border-t border-malam-3 px-5 py-4 text-lg font-bold sm:px-6">
            Skor gladi <span className="tabular-nums text-aman">81</span> dari 100, rencana tindak lanjut masuk dasbor.
          </p>
        </figure>
      </div>
    </section>
  );
}

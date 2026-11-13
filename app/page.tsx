import Link from "next/link";
import CampusPlan from "@/components/CampusPlan";
import SiteHeader from "@/components/SiteHeader";
import { GRID, SPAWN } from "@/lib/campus";
import { bestRoute, hazardTiles, safeAssembly, type Scenario } from "@/lib/sim";

const FLOOD: Scenario = { kind: "banjir", intensity: 1 };

const AI_ROLES = [
  {
    title: "Prediksi skenario dan jalur evakuasi.",
    body: "Model risiko menilai tiap gedung dari material, umur, jenis tanah, jarak ke pantai, dan curah hujan 30 hari terakhir. Hasilnya menjadi peta bahaya di dunia 3D: zona reruntuhan saat gempa, ubin tergenang saat banjir rob. Jalur tercepat yang menghindarinya dihitung dengan algoritme A*.",
    href: "/kampus",
    cta: "Coba simulasi gempa atau banjir",
  },
  {
    title: "Petugas Keselamatan Virtual.",
    body: "Karakter di halaman sekolah 3D yang bisa ditanya lewat teks atau suara: cara berlindung saat gempa, pertolongan pertama untuk luka ringan, apa yang dibawa saat evakuasi. Jawabannya dari model Llama 3.3 yang berjalan di Groq dan selalu menyarankan menghubungi 112 untuk keadaan darurat nyata.",
    href: "/kampus",
    cta: "Temui petugasnya di kampus",
  },
  {
    title: "Analisis kerentanan bangunan.",
    body: "Pengelola sekolah mengunggah foto sudut bangunan. AI membaca retak, material, dan kondisi atap, lalu memberi skor ketahanan dan rekomendasi perbaikan beserta prioritas dan perkiraan kelas biayanya. Hasil ini bahan diskusi awal, bukan pengganti pemeriksaan ahli struktur.",
    href: "/analisis",
    cta: "Unggah foto bangunan",
  },
];

export default function Home() {
  const hazards = hazardTiles(FLOOD, {});
  const route = bestRoute(GRID, SPAWN, safeAssembly(FLOOD, hazards), hazards) ?? undefined;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="grid items-center gap-10 py-12 md:py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
          <div>
            <h1 className="text-5xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[4.25rem]">
              Sekolah perlu berlatih <span className="text-fajar">sebelum</span> air naik dan tanah berguncang.
            </h1>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/kampus"
                className="inline-flex min-h-12 items-center rounded-md bg-fajar px-5 font-semibold text-malam hover:bg-fajar-tua active:translate-y-px"
              >
                Mulai latihan evakuasi
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex min-h-12 items-center rounded-md border border-malam-3 px-5 font-semibold text-pasir hover:border-redup active:translate-y-px"
              >
                Lihat peta kesiapan sekolah
              </Link>
            </div>
          </div>
          <figure className="overflow-hidden rounded-lg border border-malam-3">
            <CampusPlan route={route} label="Denah kampus contoh dengan jalur evakuasi banjir menuju titik kumpul di bukit" />
            <figcaption className="flex flex-wrap gap-x-5 gap-y-1 border-t border-malam-3 bg-malam-2 px-3 py-2.5 text-sm">
              <span className="inline-flex items-center gap-2">
                <svg aria-hidden="true" width="28" height="6" viewBox="0 0 28 6">
                  <line x1="2" y1="3" x2="26" y2="3" stroke="#ff8a3d" strokeWidth="4" strokeDasharray="6 4" strokeLinecap="round" />
                </svg>
                Jalur evakuasi banjir rob 1 m, dihitung model Arunika
              </span>
              <span className="inline-flex items-center gap-2">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="7" cy="7" r="5" fill="none" stroke="#34c47c" strokeWidth="2.5" />
                </svg>
                Titik kumpul
              </span>
            </figcaption>
          </figure>
        </section>

        <section aria-labelledby="tentang" className="grid gap-8 border-t border-malam-3 py-16 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-14">
          <h2 id="tentang" className="text-3xl font-extrabold leading-tight tracking-tight md:sticky md:top-8 md:self-start">
            Satu kampus digital, tiga tugas AI
          </h2>
          <div className="max-w-[68ch] space-y-7 text-lg leading-relaxed">
            <p>
              Arunika membangun kembaran digital 3D dari sekolah di daerah rawan bencana. Siswa berlatih evakuasi bersama
              secara daring, bertanya pada petugas keselamatan AI, dan pihak sekolah melihat bagian bangunan yang paling
              rentan.
            </p>
            {AI_ROLES.map((r) => (
              <p key={r.title} className="text-redup">
                <strong className="font-bold text-pasir">{r.title}</strong> {r.body}{" "}
                <Link href={r.href} className="font-semibold text-fajar underline decoration-fajar/40 underline-offset-4 hover:decoration-fajar">
                  {r.cta}
                </Link>
              </p>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-malam-3">
        <p className="mx-auto max-w-6xl px-4 py-6 text-redup sm:px-6">
          Arunika adalah prototipe kompetisi. Sekolah di dasbor kesiapan adalah data contoh, bukan sekolah sungguhan.
        </p>
      </footer>
    </>
  );
}

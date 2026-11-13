import Link from "next/link";
import CampusPlan from "@/components/CampusPlan";
import SiteHeader from "@/components/SiteHeader";
import { GRID, SPAWN } from "@/lib/campus";
import { bestRoute, hazardTiles, safeAssembly, type Scenario } from "@/lib/sim";

const FLOOD: Scenario = { kind: "banjir", intensity: 1 };

const AI_ROLES = [
  {
    title: "Prediksi skenario dan jalur evakuasi",
    body: "Model risiko menilai tiap gedung dari material, umur, jenis tanah, jarak ke pantai, dan curah hujan 30 hari terakhir. Hasilnya menjadi peta bahaya di dunia 3D: zona reruntuhan saat gempa, ubin tergenang saat banjir rob. Jalur tercepat yang menghindarinya dihitung dengan algoritme A*.",
    href: "/kampus",
    cta: "Coba simulasi gempa atau banjir",
  },
  {
    title: "Petugas Keselamatan Virtual",
    body: "Karakter di halaman sekolah 3D yang bisa ditanya lewat teks atau suara: cara berlindung saat gempa, pertolongan pertama untuk luka ringan, apa yang dibawa saat evakuasi. Jawabannya dari model Llama 3.3 yang berjalan di Groq dan selalu menyarankan menghubungi 112 untuk keadaan darurat nyata.",
    href: "/kampus",
    cta: "Temui petugasnya di kampus",
  },
  {
    title: "Analisis kerentanan bangunan",
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
        <section className="grid items-center gap-10 py-12 md:grid-cols-[1fr_1.15fr] md:py-20">
          <div>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Sekolah perlu berlatih <span className="text-fajar">sebelum</span> air naik dan tanah berguncang.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-redup">
              Arunika membangun kembaran digital 3D dari sekolah di daerah rawan bencana. Siswa berlatih evakuasi bersama
              secara daring, bertanya pada petugas keselamatan AI, dan pihak sekolah melihat bagian bangunan yang paling
              rentan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/kampus"
                className="inline-flex min-h-11 items-center rounded-md bg-fajar px-5 font-semibold text-malam hover:bg-fajar-tua active:translate-y-px"
              >
                Mulai latihan evakuasi
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex min-h-11 items-center rounded-md border border-malam-3 px-5 font-semibold text-pasir hover:border-redup active:translate-y-px"
              >
                Lihat peta kesiapan sekolah
              </Link>
            </div>
          </div>
          <figure>
            <div className="overflow-hidden rounded-lg border border-malam-3">
              <CampusPlan
                route={route}
                label="Denah kampus contoh dengan jalur evakuasi banjir menuju titik kumpul di bukit"
              />
            </div>
            <figcaption className="mt-3 text-sm leading-relaxed text-redup">
              Denah kampus contoh. Garis jingga adalah jalur evakuasi untuk banjir rob setinggi 1 meter yang dihitung model
              Arunika: menjauhi ubin tergenang, menuju titik kumpul di bukit (lingkaran hijau kanan atas).
            </figcaption>
          </figure>
        </section>

        <section aria-labelledby="peran-ai" className="border-t border-malam-3 py-14">
          <h2 id="peran-ai" className="text-2xl font-bold sm:text-3xl">
            Tiga tugas AI di Arunika
          </h2>
          <ol className="mt-8 divide-y divide-malam-3">
            {AI_ROLES.map((r, i) => (
              <li key={r.title} className="grid gap-3 py-7 md:grid-cols-[4rem_minmax(0,18rem)_1fr] md:gap-8">
                <span aria-hidden="true" className="text-3xl font-extrabold text-fajar">
                  0{i + 1}
                </span>
                <h3 className="text-xl font-bold">{r.title}</h3>
                <div>
                  <p className="leading-relaxed text-redup">{r.body}</p>
                  <Link
                    href={r.href}
                    className="mt-3 inline-flex min-h-11 items-center font-semibold text-fajar underline-offset-4 hover:underline"
                  >
                    {r.cta}
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="border-t border-malam-3">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-redup sm:px-6">
          Arunika adalah prototipe kompetisi. Sekolah di dasbor kesiapan adalah data contoh, bukan sekolah sungguhan.
        </p>
      </footer>
    </>
  );
}

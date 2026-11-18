import { ArrowDown, ArrowRight } from "lucide-react";
import Link from "next/link";
import Drill from "@/components/landing/Drill";
import GladiTeaser from "@/components/landing/GladiTeaser";
import Hero from "@/components/landing/Hero";
import Lessons from "@/components/landing/Lessons";
import PlanDemo from "@/components/landing/PlanDemo";
import Roles from "@/components/landing/Roles";
import SiteHeader from "@/components/SiteHeader";
import SitePlan, { CAMPUSES } from "@/components/SitePlan";

const FLOW = [
  { href: "#pelajari", label: "Pelajari" },
  { href: "#coba", label: "Latihan" },
  { href: "#gladi", label: "Gladi" },
  { href: "#pantau", label: "Pantau" },
];

const FOOTER = [
  { href: "/sekolah", label: "Sekolah" },
  { href: "/gladi", label: "Gladi ruang" },
  { href: "/dashboard", label: "Dasbor" },
  { href: "/masuk", label: "Masuk" },
];

export default function Home() {
  return (
    <>
      <div className="relative">
        <SiteHeader overlay />
        <main>
          <Hero />
          <nav aria-label="Alur Arunika" className="border-b border-malam-3">
            <ol className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4">
              {FLOW.map(({ href, label }, i) => (
                <li key={href} className="border-malam-3 max-sm:odd:border-r max-sm:nth-[-n+2]:border-b sm:not-last:border-r">
                  <a
                    href={href}
                    className="group relative flex min-h-24 items-center gap-3 px-4 py-6 text-2xl font-extrabold tracking-tight transition-colors duration-300 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-langit after:transition-transform after:duration-500 after:ease-crisp hover:bg-malam-2 hover:after:scale-x-100 sm:min-h-32 sm:px-6 sm:text-3xl lg:text-4xl"
                  >
                    <span className="font-mono font-bold text-langit">{i + 1}</span>
                    <span className="flex-1">{label}</span>
                    <ArrowDown aria-hidden="true" className="size-6 text-redup transition-transform group-hover:translate-y-1 group-hover:text-pasir" />
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <Lessons />
          <PlanDemo />
          <Drill />
          <GladiTeaser />
          <Roles />
          <section aria-labelledby="ajak" className="grain overflow-hidden border-t border-malam-3">
            <div aria-hidden="true" className="absolute inset-0 -z-10 flex items-center justify-center gap-6 opacity-[0.14] sm:gap-10">
              {CAMPUSES.map(({ id }, i) => (
                <SitePlan key={id} id={id} className={`h-auto w-[60%] shrink-0 sm:w-[34%] ${i === 1 ? "translate-y-10" : "-translate-y-6"}`} />
              ))}
            </div>
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(7_21_48/0.4),#071530_75%)]" />
            <div className="mx-auto flex max-w-6xl flex-col items-start gap-10 px-4 py-28 sm:px-6 lg:py-40">
              <h2 id="ajak" className="max-w-[16ch] text-5xl font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-7xl">
                Gempa berikutnya tidak menunggu sekolah <span className="text-fajar">siap</span>.
              </h2>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/sekolah"
                  className="group inline-flex min-h-14 items-center gap-3 rounded-md bg-laut px-7 text-lg font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22)] transition-colors hover:bg-laut-terang active:translate-y-px"
                >
                  Mulai latihan
                  <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/masuk"
                  className="inline-flex min-h-14 items-center rounded-md border border-pasir/25 bg-malam/60 px-7 text-lg font-bold transition-colors hover:border-pasir active:translate-y-px"
                >
                  Buat akun
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
      <footer className="grain border-t border-malam-3 bg-malam-2">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] md:items-center">
          <span className="flex items-center gap-2.5 text-lg font-extrabold tracking-wider uppercase">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo mark, nothing to optimise */}
            <img src="/arunika-mark.svg" alt="" width={24} height={27} className="h-7 w-auto" />
            Arunika
          </span>
          <nav aria-label="Tautan kaki">
            <ul className="flex flex-wrap gap-x-7 gap-y-2">
              {FOOTER.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-11 items-center font-semibold text-redup hover:text-pasir">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-redup md:col-span-2">
            Prototipe kompetisi. Sekolah di dasbor adalah data contoh. Data gempa dari BMKG, urutan evakuasi mengikuti panduan sekolah aman BNPB,
            karakter 3D dari Quaternius.
          </p>
        </div>
      </footer>
    </>
  );
}

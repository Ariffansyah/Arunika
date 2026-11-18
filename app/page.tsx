import { ArrowRight } from "lucide-react";
import Link from "next/link";
import GladiTeaser from "@/components/landing/GladiTeaser";
import Hero from "@/components/landing/Hero";
import PlanDemo from "@/components/landing/PlanDemo";
import SiteHeader from "@/components/SiteHeader";

const MORE = [
  { href: "/sekolah", text: "Tanya Petugas AI di sekolah." },
  { href: "/dashboard", text: "Lihat sekolah yang belum siap." },
];

export default function Home() {
  return (
    <>
      <div className="relative">
        <SiteHeader overlay />
        <main>
          <Hero />
          <PlanDemo />
          <GladiTeaser />
          <nav aria-label="Fitur lain" className="border-t border-malam-3">
            <ul className="mx-auto max-w-6xl divide-y divide-malam-3">
              {MORE.map(({ href, text }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex min-h-28 items-center justify-between gap-6 px-4 py-8 text-3xl font-extrabold tracking-tight transition-colors hover:text-langit sm:px-6 sm:text-5xl"
                  >
                    {text}
                    <ArrowRight aria-hidden="true" className="size-8 shrink-0 transition-transform group-hover:translate-x-2 sm:size-12" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </main>
      </div>
      <footer className="border-t border-malam-3 bg-malam-2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-4 px-4 py-10 sm:px-6">
          <span className="flex items-center gap-2.5 text-lg font-extrabold tracking-wider uppercase">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo mark, nothing to optimise */}
            <img src="/arunika-mark.svg" alt="" width={24} height={27} className="h-7 w-auto" />
            Arunika
          </span>
          <p className="text-redup">Prototipe kompetisi. Sekolah di dasbor adalah data contoh. Data gempa dari BMKG.</p>
        </div>
      </footer>
    </>
  );
}

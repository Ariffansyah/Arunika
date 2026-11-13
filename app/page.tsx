import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Hero from "@/components/landing/Hero";
import PlanDemo from "@/components/landing/PlanDemo";
import SiteHeader from "@/components/SiteHeader";

const LINKS = [
  { href: "/kampus", text: "Tanya petugas keselamatan AI, lewat teks atau suara." },
  { href: "/analisis", text: "Nilai ketahanan bangunan sekolah dari satu foto." },
  { href: "/dashboard", text: "Pantau kesiapan sekolah di peta Indonesia." },
];

export default function Home() {
  return (
    <>
      <div className="relative">
        <SiteHeader overlay />
        <main>
          <Hero />
          <PlanDemo />
          <nav aria-label="Fitur lain" className="border-t border-malam-3">
            <ul className="mx-auto max-w-6xl divide-y divide-malam-3 px-4 sm:px-6">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="group flex items-center justify-between gap-6 py-8 text-2xl font-bold leading-tight tracking-tight hover:text-fajar sm:py-10 sm:text-4xl"
                  >
                    {l.text}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-7 shrink-0 text-fajar transition-transform group-hover:translate-x-1 sm:size-9"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </main>
      </div>
      <footer className="border-t border-malam-3">
        <p className="mx-auto max-w-6xl px-4 py-6 text-redup sm:px-6">
          Prototipe kompetisi. Sekolah di dasbor adalah data contoh.
        </p>
      </footer>
    </>
  );
}

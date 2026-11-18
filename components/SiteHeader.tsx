import Link from "next/link";

const LINKS = [
  { href: "/sekolah", label: "Sekolah" },
  { href: "/gladi", label: "Gladi" },
  { href: "/dashboard", label: "Dasbor" },
];

export default function SiteHeader({ overlay = false, current }: { overlay?: boolean; current?: string }) {
  return (
    <header className={overlay ? "absolute inset-x-0 top-0 z-10" : "border-b border-malam-3"}>
      <nav
        aria-label="Navigasi utama"
        className="mx-auto flex max-w-6xl items-center gap-x-5 px-4 py-2 sm:gap-x-7 sm:px-6"
      >
        <Link href="/" className="mr-auto flex min-h-11 items-center gap-2.5 text-lg font-extrabold tracking-wider text-pasir uppercase">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo mark, nothing to optimise */}
          <img src="/arunika-mark.svg" alt="" width={24} height={27} className="h-7 w-auto" />
          Arunika
        </Link>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.href === current ? "page" : undefined}
            className={`flex min-h-11 items-center text-sm font-medium transition-colors hover:text-pasir active:text-fajar aria-[current=page]:text-pasir aria-[current=page]:underline aria-[current=page]:decoration-langit aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8 ${overlay ? "text-pasir/85" : "text-redup"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

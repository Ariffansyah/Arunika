import Link from "next/link";

const LINKS = [
  { href: "/kampus", label: "Kampus 3D" },
  { href: "/analisis", label: "Analisis" },
  { href: "/dashboard", label: "Dasbor" },
];

export default function SiteHeader() {
  return (
    <header className="border-b border-malam-3">
      <nav
        aria-label="Navigasi utama"
        className="mx-auto flex max-w-6xl items-center gap-x-5 px-4 py-2 sm:gap-x-7 sm:px-6"
      >
        <Link href="/" className="mr-auto text-lg font-extrabold tracking-tight text-pasir">
          Arunika<span className="text-fajar">.</span>
        </Link>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex min-h-11 items-center text-sm font-medium text-redup hover:text-pasir active:text-fajar"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

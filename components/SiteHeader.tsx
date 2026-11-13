import Link from "next/link";

const LINKS = [
  { href: "/kampus", label: "Kampus" },
  { href: "/analisis", label: "Analisis" },
  { href: "/dashboard", label: "Dasbor" },
];

export default function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={overlay ? "absolute inset-x-0 top-0 z-10" : "border-b border-malam-3"}>
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
            className={`flex min-h-11 items-center text-sm font-medium hover:text-pasir active:text-fajar ${overlay ? "text-pasir/85" : "text-redup"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

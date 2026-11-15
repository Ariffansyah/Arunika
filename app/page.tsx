import FeatureCards from "@/components/landing/FeatureCards";
import Hero from "@/components/landing/Hero";
import PlanDemo from "@/components/landing/PlanDemo";
import SiteHeader from "@/components/SiteHeader";

export default function Home() {
  return (
    <>
      <div className="relative">
        <SiteHeader overlay />
        <main>
          <Hero />
          <PlanDemo />
          <FeatureCards />
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

import islands from "@/public/data/indonesia.json";
import type { QuakeEvent, Warning } from "@/lib/bmkgFeed";
import { project } from "@/lib/nusantara";
import LiveBoard from "./LiveBoard";

// The archipelago at a tenth of a degree, the points that round together dropped: about 20 kB of path, drawn once
// on the server.
const LAND = (islands as [number, number][][])
  .map((ring) => ring.map(([lon, lat]) => project(lon, lat).map(Math.round)).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]))
  .filter((ring) => ring.length >= 3)
  .map((ring) => `M${ring.map(([x, y]) => `${x} ${y}`).join("L")}Z`)
  .join("");

// The live BMKG band. It keeps the night palette in either theme: it is a monitor, like the maps and the drill.
export default function Bmkg({ quakes, warnings }: { quakes: QuakeEvent[]; warnings: Warning[] }) {
  return (
    <section aria-labelledby="bmkg" data-theme="dark" className="grain survey seam bg-malam">
      <div className="scene mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <h2 id="bmkg" className="max-w-[17ch] text-4xl leading-[1.02] font-extrabold tracking-tight sm:text-6xl">
          Indonesia hari ini, <span className="text-langit">langsung</span> dari BMKG.
        </h2>
        <LiveBoard land={LAND} quakes={quakes} warnings={warnings} />
      </div>
    </section>
  );
}

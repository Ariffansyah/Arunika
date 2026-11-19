import islands from "@/public/data/indonesia.json";
import type { Quake } from "@/lib/gladi";

// Plate carrée at 5 units per degree from 95° E, 6° N. Rounding to a fifth of a degree and dropping the points
// that collapse keeps the archipelago to about 13 kB of path, drawn once on the server.
const K = 5;
const project = (lon: number, lat: number) => [Math.round((lon - 95) * K), Math.round((6 - lat) * K)] as const;
const W = 46 * K;
const H = 17 * K;
const LAND = (islands as [number, number][][])
  .map((ring) => ring.map(([lon, lat]) => project(lon, lat)).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]))
  .filter((ring) => ring.length >= 3)
  .map((ring) => `M${ring.map(([x, y]) => `${x} ${y}`).join("L")}Z`)
  .join("");

// Indonesia with BMKG's latest felt quake pinged where it struck.
export default function QuakeMap({ quake }: { quake: Quake | null }) {
  const at = quake && project(quake.lon, quake.lat).map((v, i) => Math.min(Math.max(v, 4), (i ? H : W) - 4));
  return (
    <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} aria-hidden="true" className="h-auto w-full">
      <path d={LAND} className="fill-malam-3" />
      {at && (
        <g transform={`translate(${at[0]} ${at[1]})`}>
          {[6, 11].map((r) => (
            <circle key={r} r={r} className="fill-none stroke-fajar/40" strokeWidth={0.6} strokeDasharray="1.5 1.5" />
          ))}
          <circle r={3.5} className="fill-none stroke-fajar motion-safe:animate-ping [transform-box:fill-box] [transform-origin:center]" strokeWidth={0.8} />
          <circle r={2} className="fill-fajar stroke-malam" strokeWidth={0.6} />
          <text x={at[0] > W - 40 ? -14 : 14} y={1.5} textAnchor={at[0] > W - 40 ? "end" : "start"} fontSize={7} className="fill-pasir font-mono font-bold">
            M{quake.magnitude.toLocaleString("id-ID")}
          </text>
        </g>
      )}
    </svg>
  );
}

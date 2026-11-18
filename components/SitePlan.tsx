import { MAPS, type Setting } from "@/lib/maps";

// Each school with the threat it is built around.
export const CAMPUSES: { id: Setting; hazard: string }[] = [
  { id: "pesisir", hazard: "banjir rob" },
  { id: "pegunungan", hazard: "longsor" },
  { id: "kota", hazard: "gempa" },
];

const TILE_FILL: Record<string, string> = { b: "#afc4ec", h: "#1d5a6e", g: "#174a5c", t: "#2b8a74" };
const tileClass = (c: string) => (/\d/.test(c) ? "b" : c === "T" ? "t" : c === "h" || c === "g" ? c : null);

// A school's real site plan, one rect per run of same-kind tiles so it stays a few hundred nodes.
export default function SitePlan({ id, className }: { id: Setting; className?: string }) {
  const grid = MAPS[id]!.grid;
  const runs = grid.flatMap((row, z) => {
    const out: { x: number; z: number; w: number; k: string }[] = [];
    for (let x = 0; x < row.length; ) {
      const k = tileClass(row[x]);
      let w = 1;
      while (x + w < row.length && tileClass(row[x + w]) === k) w++;
      if (k) out.push({ x, z, w, k });
      x += w;
    }
    return out;
  });
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${grid[0].length} ${grid.length}`} shapeRendering="crispEdges" className={className}>
      {runs.map((r) => (
        <rect key={`${r.x}-${r.z}`} x={r.x} y={r.z} width={r.w + 0.02} height={1.02} fill={TILE_FILL[r.k]} />
      ))}
    </svg>
  );
}

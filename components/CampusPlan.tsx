import { ASSEMBLY, GRID, H, W, buildingRects, type Tile } from "@/lib/campus";

const FILL: Record<string, string> = { h: "#1f4a3a", g: "#24533f", "=": "#3a4f6e" };

/** Top-down SVG of the campus grid, with an optional evacuation route drawn on top. */
export default function CampusPlan({ route, label, children }: { route?: Tile[]; label: string; children?: React.ReactNode }) {
  const rects = buildingRects();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
      <rect width={W} height={H} fill="#1b2c45" />
      {GRID.flatMap((row, z) =>
        [...row].map((c, x) =>
          FILL[c] ? <rect key={`${x}-${z}`} x={x} y={z} width={1.02} height={1.02} fill={FILL[c]} /> : null,
        ),
      )}
      {Object.entries(rects).map(([id, r]) => (
        <rect key={id} x={r.x0} y={r.z0} width={r.x1 - r.x0 + 1} height={r.z1 - r.z0 + 1} fill="#c96a3c" rx={0.2} />
      ))}
      {GRID.flatMap((row, z) =>
        [...row].map((c, x) => (c === "T" ? <circle key={`t${x}-${z}`} cx={x + 0.5} cy={z + 0.5} r={0.45} fill="#2f7d55" /> : null)),
      )}
      {ASSEMBLY.map(([x, z]) => (
        <circle key={`a${x}`} cx={x + 0.5} cy={z + 0.5} r={0.8} fill="none" stroke="#34c47c" strokeWidth={0.25} />
      ))}
      {route && (
        <polyline
          points={route.map(([x, z]) => `${x + 0.5},${z + 0.5}`).join(" ")}
          fill="none"
          stroke="#ff8a3d"
          strokeWidth={0.35}
          strokeDasharray="0.7 0.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {children}
    </svg>
  );
}

import { ASSEMBLY, GRID, H, W, buildingRects, surfaceAt, type Tile } from "@/lib/campus";

const FILL: Record<string, string> = { h: "#1f4a3a", g: "#24533f", "=": "#3a4f6e" };
const SURFACE_FILL = { paving: "#2a3d5c", court: "#264d7a" };

export default function CampusPlan({
  route,
  hazards,
  hazardColor = "#3b82c4",
  label,
  children,
}: {
  route?: Tile[];
  hazards?: Set<number>;
  hazardColor?: string;
  label: string;
  children?: React.ReactNode;
}) {
  const rects = buildingRects();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
      <rect width={W} height={H} fill="#1b2c45" />
      {GRID.flatMap((row, z) =>
        [...row].map((c, x) =>
          {
            const fill = FILL[c] ?? (surfaceAt(x, z) ? SURFACE_FILL[surfaceAt(x, z)!] : undefined);
            return fill ? <rect key={`${x}-${z}`} x={x} y={z} width={1.02} height={1.02} fill={fill} /> : null;
          },
        ),
      )}
      {Object.entries(rects).map(([id, r]) => (
        <rect key={id} x={r.x0} y={r.z0} width={r.x1 - r.x0 + 1} height={r.z1 - r.z0 + 1} fill="#c96a3c" rx={0.2} />
      ))}
      {GRID.flatMap((row, z) =>
        [...row].map((c, x) => (c === "T" ? <circle key={`t${x}-${z}`} cx={x + 0.5} cy={z + 0.5} r={0.45} fill="#2f7d55" /> : null)),
      )}
      {hazards &&
        [...hazards].map((i) => (
          <rect key={`h${i}`} x={i % W} y={Math.floor(i / W)} width={1} height={1} fill={hazardColor} opacity={0.42} />
        ))}
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

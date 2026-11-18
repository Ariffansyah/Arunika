import { ASSEMBLY, BUILDINGS, GRID, H, W, buildingRects, shortName, surfaceAt, type Tile } from "@/lib/campus";

const FILL: Record<string, string> = { h: "#163f4f", g: "#17485a", "=": "#2a4677" };
const SURFACE_FILL = { paving: "#123060", court: "#1a4486", trail: "#33394d" };

export default function CampusPlan({
  route,
  path,
  hazards,
  hazardColor = "#3b82c4",
  labels,
  label,
  children,
}: {
  route?: Tile[];
  // Like route, but free points in plan units (tile widths) rather than tile corners.
  path?: [number, number][];
  hazards?: Set<number>;
  hazardColor?: string;
  // Largest font size for building names, in tile widths; none when left out. Small plans need larger type.
  labels?: number;
  label: string;
  children?: React.ReactNode;
}) {
  const rects = buildingRects();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
      <rect width={W} height={H} fill="#0b1e3f" />
      {GRID.flatMap((row, z) =>
        [...row].map((c, x) =>
          {
            const surface = surfaceAt(x, z);
            const fill = surface ? SURFACE_FILL[surface] : FILL[c];
            return fill ? <rect key={`${x}-${z}`} x={x} y={z} width={1.02} height={1.02} fill={fill} /> : null;
          },
        ),
      )}
      {Object.entries(rects).map(([id, r]) => (
        <rect key={id} x={r.x0} y={r.z0} width={r.x1 - r.x0 + 1} height={r.z1 - r.z0 + 1} fill="#afc4ec" rx={0.2} />
      ))}
      {GRID.flatMap((row, z) =>
        [...row].map((c, x) =>
          c === "T" ? (
            <circle key={`t${x}-${z}`} cx={x + 0.5} cy={z + 0.5} r={0.45} fill="#2b8a74" />
          ) : c === "-" || c === "|" ? (
            <rect key={`r${x}-${z}`} x={c === "-" ? x : x + 0.45} y={c === "-" ? z + 0.45 : z} width={c === "-" ? 1 : 0.1} height={c === "-" ? 0.1 : 1} fill="#8fb8a0" />
          ) : null,
        ),
      )}
      {hazards &&
        [...hazards].map((i) => (
          <rect key={`h${i}`} x={i % W} y={Math.floor(i / W)} width={1} height={1} fill={hazardColor} opacity={0.42} />
        ))}
      {ASSEMBLY.map(([x, z]) => (
        <circle key={`a${x}`} cx={x + 0.5} cy={z + 0.5} r={0.8} fill="none" stroke="#34c47c" strokeWidth={0.25} />
      ))}
      {labels &&
        Object.entries(rects).map(([id, r]) => {
          const w = r.x1 - r.x0 + 1;
          const h = r.z1 - r.z0 + 1;
          const text = shortName(BUILDINGS[id].name);
          // Tall narrow blocks read sideways, the way names run along a street on a map.
          const upright = h > w * 1.4;
          const [along, across] = upright ? [h, w] : [w, h];
          // Never below 70% of the largest size: a name too long for a small block spills over it on a halo instead.
          const size = Math.max(labels * 0.7, Math.min(labels, (along - 0.6) / (text.length * 0.6), across * 0.55));
          const [cx, cz] = [r.x0 + w / 2, r.z0 + h / 2];
          return (
            <text
              key={`l${id}`}
              x={cx}
              y={cz}
              fontSize={size}
              fontWeight={700}
              fill="#071530"
              stroke="#afc4ec"
              strokeWidth={size * 0.45}
              strokeLinejoin="round"
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="central"
              transform={upright ? `rotate(-90 ${cx} ${cz})` : undefined}
            >
              {text}
            </text>
          );
        })}
      {(route || path) && (
        <polyline
          points={(path ?? route!.map(([x, z]) => [x + 0.5, z + 0.5])).map(([x, z]) => `${x},${z}`).join(" ")}
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

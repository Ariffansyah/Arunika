import type { CSSProperties } from "react";
import type { Hazard } from "@/lib/gladi";

// One period of a seismogram, 400 units wide: background noise, the small P wave, the large S wave and its coda.
// It is quiet at both ends, so two periods side by side scroll without a seam.
function seismogram() {
  const pts: string[] = [];
  for (let x = 0; x <= 800; x += 2) {
    const u = x % 400;
    const env = u < 110 ? 2 : u < 160 ? 9 : u < 175 ? 9 + (u - 160) * 3 : u < 330 ? 54 * Math.exp(-(u - 175) / 55) + 2 : 2;
    pts.push(`${x},${(100 + env * Math.sin(x * 2.3) * (0.55 + 0.45 * Math.sin(x * 0.37 + 1.3))).toFixed(1)}`);
  }
  return `M${pts.join("L")}`;
}
export const TRACE = seismogram();

// Two periods of a 100-unit swell on y = 0, closed far below so it fills as water.
const SWELL = `M0,0${Array.from({ length: 8 }, (_, i) => `Q${i * 100 + 25},-7 ${i * 100 + 50},0T${i * 100 + 100},0`).join("")}L800,120L0,120Z`;

const delay = (s: number) => ({ animationDelay: `${s}s` }) as CSSProperties;
const TREE = "#2b8a74";
const MUD = "#8a6a4a";

function Gempa() {
  return (
    <>
      {[40, 160].map((y) => (
        <line key={y} x1={0} x2={400} y1={y} y2={y} className="stroke-malam-3" strokeDasharray="2 6" />
      ))}
      <line x1={0} x2={400} y1={100} y2={100} className="stroke-malam-3" />
      {/* The paper fades at both edges; the mask sits on a still group so the fade stays put while the trace moves. */}
      <defs>
        <linearGradient id="seismo-edge">
          <stop offset={0} stopColor="#fff" stopOpacity={0} />
          <stop offset={0.12} stopColor="#fff" />
          <stop offset={0.88} stopColor="#fff" />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id="seismo-fade">
          <rect width={400} height={200} fill="url(#seismo-edge)" />
        </mask>
      </defs>
      <g mask="url(#seismo-fade)">
        <path d={TRACE} className="fill-none stroke-langit motion-safe:animate-scroll" strokeWidth={1.6} strokeLinejoin="round" />
      </g>
    </>
  );
}

function Banjir() {
  return (
    <>
      <polygon points="190,62 285,24 380,62" className="fill-malam-3" />
      <rect x={200} y={60} width={170} height={110} className="fill-malam-3" />
      {[222, 262, 318].map((x) => (
        <rect key={x} x={x} y={80} width={28} height={26} rx={2} className="fill-malam-2" />
      ))}
      <rect x={300} y={120} width={30} height={50} rx={2} className="fill-malam-2" />
      {/* A staff gauge, 1 m per 100 units with red and white bands, as at a river post. */}
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={150} y={30 + i * 14} width={18} height={14} fill={i % 2 ? "#eaf1ff" : "#ff6b6b"} />
      ))}
      <g className="fill-redup font-mono" fontSize={11} textAnchor="end">
        <text x={142} y={74}>1 m</text>
        <text x={142} y={124}>0,5</text>
      </g>
      {/* Knee height: the depth a student must not wade through. */}
      <line x1={174} x2={400} y1={120} y2={120} className="stroke-fajar" strokeWidth={1.5} strokeDasharray="5 5" />
      {/* Nested groups: a CSS animation replaces an element's transform attribute rather than adding to it. */}
      <g className="motion-safe:animate-tide">
        <g transform="translate(0 108)">
          <path d={SWELL} className="fill-langit/30 stroke-langit motion-safe:animate-scroll" strokeWidth={1.5} />
        </g>
      </g>
      <line x1={0} x2={400} y1={170} y2={170} className="stroke-redup" strokeWidth={1.5} opacity={0.5} />
    </>
  );
}

function Angin() {
  return (
    <>
      <line x1={0} x2={400} y1={170} y2={170} className="stroke-redup" strokeWidth={1.5} opacity={0.5} />
      <g className="motion-safe:animate-sway [transform-box:view-box] [transform-origin:110px_170px]">
        <path d="M110 170 Q108 130 114 92" fill="none" stroke={MUD} strokeWidth={8} strokeLinecap="round" />
        <circle cx={114} cy={78} r={30} fill={TREE} />
        <circle cx={92} cy={96} r={20} fill={TREE} />
        <circle cx={136} cy={98} r={18} fill={TREE} />
      </g>
      <line x1={300} x2={300} y1={170} y2={64} className="stroke-redup" strokeWidth={3} />
      <g className="motion-safe:animate-spin [transform-box:view-box] [transform-origin:300px_60px]">
        {[0, 120, 240].map((a) => (
          <g key={a} transform={`rotate(${a} 300 60)`}>
            <line x1={300} y1={60} x2={334} y2={60} className="stroke-redup" strokeWidth={2.5} />
            <path d="M334 52 a8 8 0 0 1 0 16 Z" className="fill-langit" />
          </g>
        ))}
      </g>
      <circle cx={300} cy={60} r={5} className="fill-pasir" />
      {[30, 58, 96, 128, 150].map((y, i) => (
        <path
          key={y}
          d={`M0 ${y} q30 -8 60 0 t60 0`}
          className="fill-none stroke-langit/70 motion-safe:animate-gust"
          strokeWidth={2}
          strokeLinecap="round"
          style={delay(i * 0.47)}
        />
      ))}
      {[48, 112, 140].map((y, i) => (
        <ellipse key={y} cx={0} cy={y} rx={5} ry={2.5} fill={TREE} className="motion-safe:animate-gust" style={delay(0.3 + i * 0.8)} />
      ))}
    </>
  );
}

function Longsor() {
  return (
    <>
      <polygon points="0,40 120,48 300,170 400,174 400,200 0,200" className="fill-malam-3" />
      <rect x={322} y={128} width={60} height={46} className="fill-kabut/50" />
      <polygon points="316,130 352,112 388,130" className="fill-kabut/50" />
      {/* Warning signs on the slope: a tree leaning downhill and a crack opening above the slide. */}
      <g transform="rotate(16 62 44)">
        <line x1={62} y1={44} x2={62} y2={4} stroke={MUD} strokeWidth={5} strokeLinecap="round" />
        <circle cx={62} cy={6} r={14} fill={TREE} />
      </g>
      <path d="M100 47 l6 4 l-3 3 l7 3 l-2 4" fill="none" className="stroke-bahaya motion-safe:animate-pulse" strokeWidth={2} strokeLinejoin="round" />
      {[
        [140, 56, 0],
        [158, 66, 1.2],
        [128, 50, 2.4],
      ].map(([x, y, d]) => (
        <polygon
          key={x}
          points={`${x - 6},${y + 4} ${x - 3},${y - 5} ${x + 5},${y - 4} ${x + 7},${y + 3}`}
          fill={MUD}
          className="motion-safe:animate-slide [transform-box:fill-box] [transform-origin:center]"
          style={delay(d)}
        />
      ))}
      {Array.from({ length: 14 }, (_, i) => {
        const x = 30 + ((i * 97) % 360);
        const y = 10 + ((i * 37) % 50);
        return (
          <line
            key={i}
            x1={x}
            y1={y}
            x2={x - 4}
            y2={y + 12}
            className="stroke-langit/60 motion-safe:animate-rain"
            strokeWidth={1.5}
            strokeLinecap="round"
            style={delay((i * 0.13) % 0.9)}
          />
        );
      })}
    </>
  );
}

const SCENE = { gempa: Gempa, banjir: Banjir, angin: Angin, longsor: Longsor };

// The early-warning instrument for each hazard, drawn moving: what the school's siren is reacting to.
export default function Instrument({ kind, className }: { kind: Hazard; className?: string }) {
  const Scene = SCENE[kind];
  return (
    <svg viewBox="0 0 400 200" aria-hidden="true" className={className}>
      <Scene />
    </svg>
  );
}

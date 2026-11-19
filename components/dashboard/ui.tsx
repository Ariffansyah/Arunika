import { CircleCheck, CircleDashed, OctagonAlert, TriangleAlert } from "lucide-react";
import CountUp from "@/components/CountUp";
import { num } from "@/lib/format";

export const primaryBtn =
  "inline-flex min-h-11 items-center gap-2 rounded-md bg-laut px-5 font-semibold text-white transition-colors hover:bg-laut-terang active:translate-y-px disabled:opacity-50";
export const secondaryBtn =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-malam-3 px-5 font-semibold text-pasir transition-colors hover:border-redup hover:bg-malam-2 active:translate-y-px disabled:opacity-50";

// Status colours always ship with an icon and a label, never colour alone. `color` follows the page theme; `hex`
// is for the 3D map, which keeps its night palette and cannot read CSS variables.
export const STATUS = [
  { min: 70, label: "Siap", color: "var(--color-aman)", hex: "#34c47c", Icon: CircleCheck },
  { min: 45, label: "Perlu penguatan", color: "var(--color-kuning)", hex: "#f0b429", Icon: TriangleAlert },
  { min: 0, label: "Rawan", color: "var(--color-bahaya)", hex: "#ff6b6b", Icon: OctagonAlert },
];
export const NO_DATA = { min: -1, label: "Belum ada data", color: "var(--color-abu)", hex: "#7f93b8", Icon: CircleDashed };
export const statusOf = (r: number | null) => (r === null ? NO_DATA : STATUS.find((s) => r >= s.min)!);

export function StatusLabel({ readiness }: { readiness: number | null }) {
  const s = statusOf(readiness);
  return (
    <span className="inline-flex items-center gap-1.5">
      <s.Icon aria-hidden="true" className="size-4 shrink-0" style={{ color: s.color }} />
      {s.label}
    </span>
  );
}

// Label and value on one line: facts read as a list, not as stat tiles.
export function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-malam-3 rounded-lg border border-malam-3 bg-malam-2 shadow-edge">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3">
          <dt className="text-redup">{k}</dt>
          <dd className="font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Meter({ label, value, max, href }: { label: string; value: number | null; max: number; href?: React.ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-redup">{label}</span>
        <span className="font-semibold tabular-nums">
          {value === null ? (
            (href ?? "Belum ada")
          ) : (
            <>
              <CountUp value={value} /> / {num(max)}
            </>
          )}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-malam-3" aria-hidden="true">
        {value !== null && <div className="h-full origin-left rounded-full bg-langit motion-safe:animate-grow" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />}
      </div>
    </div>
  );
}

export function PrintSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-malam/85 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-lg border border-malam-3 bg-malam-2 p-6 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-extrabold">{title}</h2>
        {children}
        <div className="flex gap-3 border-t border-malam-3 pt-5">
          <button type="button" onClick={() => window.print()} className={primaryBtn}>
            Cetak
          </button>
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { CircleCheck, CircleDashed, OctagonAlert, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RequireAuth, { Notice } from "@/components/RequireAuth";
import { COST_LABEL, PRIORITY_LABEL, parseAssessment, type Recommendation } from "@/lib/assessment";
import { structureRisk } from "@/lib/sim";
import { supabase, type School } from "@/lib/supabase";

const IndonesiaMap = dynamic(() => import("@/components/dashboard/IndonesiaMap"), {
  ssr: false,
  loading: () => <p className="p-4 text-redup">Memuat peta 3D…</p>,
});

type Row = School & {
  drills: number | null;
  participants: number | null;
  avg_score: number | null;
  structural_score: number | null;
  readiness: number | null;
};

// Status colours are validated for the dark surface and always shown with an icon and a label.
const STATUS = [
  { min: 70, label: "Siap", color: "#2fae6b", Icon: CircleCheck },
  { min: 45, label: "Perlu penguatan", color: "#d9a520", Icon: TriangleAlert },
  { min: 0, label: "Rawan", color: "#e5484d", Icon: OctagonAlert },
];
const NO_DATA = { min: -1, label: "Belum ada data", color: "#6b7a90", Icon: CircleDashed };
const statusOf = (r: number | null) => (r === null ? NO_DATA : STATUS.find((s) => r >= s.min)!);

/** Worst of a reference quake (M 6.5) and a 1 m tidal flood, from the same model the drills use. */
function exposure(s: School) {
  const main = { floors: s.floors, material: s.material, built_year: s.built_year };
  const site = { soil: s.soil, coast_km: s.coast_km, rain_30d_mm: s.rain_30d_mm };
  return Math.max(
    structureRisk(main, site, { kind: "gempa", intensity: 6.5 }),
    structureRisk(main, site, { kind: "banjir", intensity: 1 }),
  );
}

function StatusLabel({ readiness }: { readiness: number | null }) {
  const s = statusOf(readiness);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <s.Icon aria-hidden="true" className="size-4 shrink-0" style={{ color: s.color }} />
      {s.label}
    </span>
  );
}

function Meter({ label, value, max, note }: { label: string; value: number | null; max: number; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-redup">{label}</span>
        <span className="font-semibold tabular-nums">{value === null ? "Belum ada" : `${value} / ${max}`}</span>
      </div>
      <div className="mt-1 h-2 rounded bg-malam-3" aria-hidden="true">
        {value !== null && (
          <div className="h-full rounded bg-pasir" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        )}
      </div>
      {note && <p className="mt-1 text-xs text-redup">{note}</p>}
    </div>
  );
}

function Detail({ row, exp }: { row: Row; exp: number }) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    supabase()
      .from("assessments")
      .select("result")
      .eq("school_id", row.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) return setError(error.message);
        setRecs(parseAssessment(data?.[0]?.result)?.recommendations ?? []);
      });
    return () => {
      live = false;
    };
  }, [row.id]);

  return (
    <section aria-labelledby="detail-title" className="space-y-5 rounded-lg border border-malam-3 p-5">
      <div>
        <h2 id="detail-title" className="text-xl font-bold">
          {row.name}
        </h2>
        <p className="text-sm text-redup">
          {row.region} · Ancaman: {row.hazards.join(", ")}
        </p>
        <div className="mt-2">
          <StatusLabel readiness={row.readiness} />
        </div>
      </div>
      <div className="space-y-4">
        <Meter label="Indeks kesiapan" value={row.readiness} max={100} />
        <Meter
          label="Rata-rata skor latihan"
          value={row.avg_score}
          max={1200}
          note={`${row.drills ?? 0} latihan oleh ${row.participants ?? 0} peserta`}
        />
        <Meter label="Skor ketahanan struktur terbaru" value={row.structural_score} max={100} />
        <Meter label="Paparan risiko (model Arunika)" value={exp} max={100} note="Makin tinggi makin rentan" />
      </div>
      <div>
        <h3 className="font-semibold">Rekomendasi dari analisis struktur terakhir</h3>
        {error ? (
          <p role="alert" className="mt-1 text-sm text-bahaya">
            {error}
          </p>
        ) : !recs ? (
          <p role="status" className="mt-1 text-sm text-redup">
            Memuat…
          </p>
        ) : recs.length === 0 ? (
          <p className="mt-1 text-sm text-redup">
            Belum ada. <Link href="/analisis" className="font-semibold text-fajar underline-offset-4 hover:underline">Unggah foto bangunan</Link> untuk
            mendapatkannya.
          </p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {recs.map((r) => (
              <li key={r.action}>
                {r.action}
                <span className="block text-redup">
                  {PRIORITY_LABEL[r.priority]} · {COST_LABEL[r.cost_band]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link
        href={`/kampus?room=${row.id}`}
        className="inline-flex min-h-11 items-center rounded-md border border-malam-3 px-4 font-semibold hover:border-redup active:translate-y-px"
      >
        Latihan evakuasi di ruang sekolah ini
      </Link>
    </section>
  );
}

function Board() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .from("school_readiness")
      .select("*")
      .then(({ data, error }) => (error ? setError(error.message) : setRows(data as Row[])));
  }, []);

  const ranked = useMemo(() => {
    if (!rows) return [];
    return rows
      .map((r) => ({ row: r, exp: exposure(r) }))
      // Highest exposure with the lowest readiness first: where help matters most.
      .sort((a, b) => b.exp * (100 - (b.row.readiness ?? 0)) - a.exp * (100 - (a.row.readiness ?? 0)));
  }, [rows]);

  if (error) return <Notice tone="error">Gagal memuat data sekolah: {error}</Notice>;
  if (!rows) return <Notice>Memuat data sekolah…</Notice>;
  if (rows.length === 0) return <Notice>Belum ada sekolah terdaftar. Jalankan supabase/schema.sql untuk data contoh.</Notice>;

  const current = ranked.find((r) => r.row.id === selected) ?? ranked[0];
  const withReadiness = rows.filter((r) => r.readiness !== null);
  const avgReadiness = withReadiness.length
    ? Math.round(withReadiness.reduce((s, r) => s + r.readiness!, 0) / withReadiness.length)
    : null;

  return (
    <div className="mt-8 space-y-8">
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          ["Sekolah terdaftar", String(rows.length)],
          ["Rata-rata indeks kesiapan", avgReadiness === null ? "Belum ada" : `${avgReadiness} / 100`],
          ["Latihan evakuasi tercatat", String(rows.reduce((s, r) => s + (r.drills ?? 0), 0))],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-malam-3 p-4">
            <dt className="text-sm text-redup">{k}</dt>
            <dd className="mt-1 text-3xl font-extrabold">{v}</dd>
          </div>
        ))}
      </dl>
      {rows.some((r) => r.is_demo) && (
        <p className="text-sm text-redup">Sekolah bertanda (demo) dan skor awalnya adalah data contoh, bukan data lapangan.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="h-80 overflow-hidden rounded-lg border border-malam-3 sm:h-[30rem]">
            <IndonesiaMap
              schools={ranked.map(({ row, exp }) => ({
                id: row.id,
                name: row.name,
                lat: row.lat,
                lon: row.lon,
                exposure: exp,
                color: statusOf(row.readiness).color,
              }))}
              selected={current.row.id}
              onSelect={setSelected}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-redup">
            {[...STATUS, NO_DATA].map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <s.Icon aria-hidden="true" className="size-4" style={{ color: s.color }} />
                {s.label}
              </span>
            ))}
            <span>Tinggi kolom = paparan risiko. Seret untuk memutar peta.</span>
          </div>
        </div>

        <section aria-labelledby="prioritas">
          <h2 id="prioritas" className="font-bold">
            Urutan prioritas intervensi
          </h2>
          <ol className="mt-3 divide-y divide-malam-3 rounded-lg border border-malam-3">
            {ranked.map(({ row, exp }) => (
              <li key={row.id}>
                <button
                  type="button"
                  aria-pressed={row.id === current.row.id}
                  onClick={() => setSelected(row.id)}
                  className="block min-h-11 w-full px-3 py-2.5 text-left hover:bg-malam-2 aria-pressed:bg-malam-2"
                >
                  <span className="block font-semibold">{row.name}</span>
                  <span className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-redup">
                    <StatusLabel readiness={row.readiness} />
                    <span className="tabular-nums">
                      Kesiapan {row.readiness ?? "–"} · Paparan {exp}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Detail key={current.row.id} row={current.row} exp={current.exp} />
    </div>
  );
}

export default function Dashboard() {
  return <RequireAuth>{() => <Board />}</RequireAuth>;
}

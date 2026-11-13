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
  loading: () => <p className="p-4 text-redup">Memuat peta…</p>,
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
    <span className="inline-flex items-center gap-1.5">
      <s.Icon aria-hidden="true" className="size-4 shrink-0" style={{ color: s.color }} />
      {s.label}
    </span>
  );
}

function Meter({ label, value, max }: { label: string; value: number | null; max: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-redup">{label}</span>
        <span className="font-semibold tabular-nums">{value === null ? "Belum ada" : `${value} / ${max}`}</span>
      </div>
      <div className="mt-1.5 h-2 rounded bg-malam-3" aria-hidden="true">
        {value !== null && (
          <div className="h-full rounded bg-pasir" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        )}
      </div>
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
      <h2 id="detail-title" className="text-xl font-bold">
        {row.name} <span className="font-normal text-redup">· {row.region}</span>
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-redup">Status</dt>
        <dd>
          <StatusLabel readiness={row.readiness} />
        </dd>
        <dt className="text-redup">Ancaman</dt>
        <dd>{row.hazards.join(", ")}</dd>
        <dt className="text-redup">Latihan</dt>
        <dd className="tabular-nums">
          {row.drills ?? 0} kali oleh {row.participants ?? 0} peserta
        </dd>
      </dl>
      <div className="space-y-4">
        <Meter label="Indeks kesiapan" value={row.readiness} max={100} />
        <Meter label="Rata-rata skor latihan" value={row.avg_score} max={1200} />
        <Meter label="Skor ketahanan struktur" value={row.structural_score} max={100} />
        <Meter label="Paparan risiko (tinggi = rentan)" value={exp} max={100} />
      </div>
      <div>
        <h3 className="font-bold">Rekomendasi analisis struktur terakhir</h3>
        {error ? (
          <p role="alert" className="mt-2 text-bahaya">
            {error}
          </p>
        ) : !recs ? (
          <p role="status" className="mt-2 text-redup">
            Memuat…
          </p>
        ) : recs.length === 0 ? (
          <p className="mt-2 text-redup">
            Belum ada.{" "}
            <Link href="/analisis" className="font-semibold text-fajar underline decoration-fajar/40 underline-offset-4 hover:decoration-fajar">
              Unggah foto bangunan
            </Link>{" "}
            untuk mendapatkannya.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recs.map((r) => (
              <li key={r.action}>
                {r.action}{" "}
                <span className="text-redup">
                  ({PRIORITY_LABEL[r.priority].toLowerCase()}, {COST_LABEL[r.cost_band].toLowerCase()})
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
        Latihan di ruang ini
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
  const totalDrills = rows.reduce((s, r) => s + (r.drills ?? 0), 0);
  const cell = "px-3 py-2.5";

  return (
    <div className="mt-8 space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="overflow-hidden rounded-lg border border-malam-3">
          <div className="h-96 sm:h-[32rem]">
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
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-malam-3 bg-malam-2 px-3 py-2.5 text-sm">
            {[...STATUS, NO_DATA].map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <s.Icon aria-hidden="true" className="size-4" style={{ color: s.color }} />
                {s.label}
              </span>
            ))}
            <span className="text-redup">Tinggi kolom: paparan risiko. Seret untuk memutar.</span>
          </div>
        </div>
        <Detail key={current.row.id} row={current.row} exp={current.exp} />
      </div>

      <section aria-labelledby="prioritas">
        <h2 id="prioritas" className="text-xl font-bold">
          Urutan prioritas intervensi
        </h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-malam-3">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="border-b border-malam-3 text-redup">
              <tr>
                <th scope="col" className={`${cell} font-medium`}>Sekolah</th>
                <th scope="col" className={`${cell} font-medium`}>Wilayah</th>
                <th scope="col" className={`${cell} font-medium`}>Status</th>
                <th scope="col" className={`${cell} text-right font-medium`}>Kesiapan</th>
                <th scope="col" className={`${cell} text-right font-medium`}>Paparan</th>
                <th scope="col" className={`${cell} text-right font-medium`}>Latihan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-malam-3">
              {ranked.map(({ row, exp }) => {
                const active = row.id === current.row.id;
                return (
                  <tr key={row.id} className={active ? "bg-malam-2" : "hover:bg-malam-2/60"}>
                    <th scope="row" className="p-0 font-semibold">
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelected(row.id)}
                        className={`${cell} block min-h-11 w-full text-left hover:text-fajar`}
                      >
                        {row.name}
                      </button>
                    </th>
                    <td className={`${cell} text-redup`}>{row.region}</td>
                    <td className={cell}>
                      <StatusLabel readiness={row.readiness} />
                    </td>
                    <td className={`${cell} text-right tabular-nums`}>{row.readiness ?? "–"}</td>
                    <td className={`${cell} text-right tabular-nums`}>{exp}</td>
                    <td className={`${cell} text-right tabular-nums`}>{row.drills ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-malam-3">
              <tr>
                <th scope="row" className={`${cell} font-semibold`}>
                  {rows.length} sekolah
                </th>
                <td className={cell} colSpan={2} />
                <td className={`${cell} text-right tabular-nums`}>{avgReadiness ?? "–"}</td>
                <td className={cell} />
                <td className={`${cell} text-right tabular-nums`}>{totalDrills}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {rows.some((r) => r.is_demo) && (
          <p className="mt-4 text-redup">Sekolah bertanda (demo) dan skor awalnya adalah data contoh, bukan data lapangan.</p>
        )}
      </section>
    </div>
  );
}

export default function Dashboard() {
  return <RequireAuth>{() => <Board />}</RequireAuth>;
}

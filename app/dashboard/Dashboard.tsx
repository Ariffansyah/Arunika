"use client";

import {
  Building2,
  CircleCheck,
  CircleDashed,
  GraduationCap,
  Landmark,
  OctagonAlert,
  Save,
  TriangleAlert,
  Users,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RequireAuth, { Notice, type Me } from "@/components/RequireAuth";
import {
  COST_LABEL,
  PRIORITY_LABEL,
  parseAssessment,
  type Recommendation,
} from "@/lib/assessment";
import { structureRisk, type Scenario } from "@/lib/sim";
import { ROLE_LABEL, supabase, type Role, type School } from "@/lib/supabase";
import RoleViewGuru, { type SchoolDrillItem } from "@/components/dashboard/RoleViewGuru";
import RoleViewKepalaSekolah from "@/components/dashboard/RoleViewKepalaSekolah";
import RoleViewPemda from "@/components/dashboard/RoleViewPemda";
import RoleViewSiswa, { type DrillRecord } from "@/components/dashboard/RoleViewSiswa";

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

// Status colours always ship with an icon and a label, never colour alone.
const STATUS = [
  { min: 70, label: "Siap", color: "#2fae6b", Icon: CircleCheck },
  { min: 45, label: "Perlu penguatan", color: "#d9a520", Icon: TriangleAlert },
  { min: 0, label: "Rawan", color: "#e5484d", Icon: OctagonAlert },
];
const NO_DATA = { min: -1, label: "Belum ada data", color: "#6b7a90", Icon: CircleDashed };
const statusOf = (r: number | null) => (r === null ? NO_DATA : STATUS.find((s) => r >= s.min)!);

// Worst of a reference quake (M 6.5) and a 1 m tidal flood.
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

const ROLE_ICONS: Record<Role, React.ComponentType<{ className?: string }>> = {
  siswa: GraduationCap,
  guru: Users,
  kepala_sekolah: Building2,
  pemda: Landmark,
};

function Board({ me }: { me: Me }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Role management
  const [activeRole, setActiveRole] = useState<Role>(me.profile.role);
  const [currentProfileRole, setCurrentProfileRole] = useState<Role>(me.profile.role);
  const [savingRole, setSavingRole] = useState(false);
  const [saveRoleNotice, setSaveRoleNotice] = useState<string | null>(null);

  // Role data
  const [myDrills, setMyDrills] = useState<DrillRecord[]>([]);
  const [schoolDrills, setSchoolDrills] = useState<SchoolDrillItem[]>([]);
  const [schoolRecs, setSchoolRecs] = useState<Recommendation[]>([]);
  const [pemdaFilter, setPemdaFilter] = useState<"all" | "rawan" | "penguatan" | "siap">("all");

  useEffect(() => {
    const sb = supabase();

    // 1. Fetch schools readiness view
    sb.from("school_readiness")
      .select("*")
      .then(({ data, error: err }) => (err ? setError(err.message) : setRows(data as Row[])));

    // 2. Fetch current user's drill history
    sb.from("drill_results")
      .select("id, scenario, score, time_s, reached, created_at")
      .eq("user_id", me.profile.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMyDrills(data as DrillRecord[]);
      });

    // 3. Fetch school-specific drills if attached to a school
    const targetSchoolId = me.profile.school_id;
    if (targetSchoolId) {
      sb.from("drill_results")
        .select("id, scenario, score, time_s, reached, created_at, profiles(display_name)")
        .eq("school_id", targetSchoolId)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data }) => {
          if (data) {
            type DrillQueryItem = {
              id: number;
              scenario: Scenario["kind"];
              score: number;
              time_s: number;
              reached: boolean;
              created_at: string;
              profiles: { display_name: string } | { display_name: string }[] | null;
            };
            const formatted: SchoolDrillItem[] = (data as unknown as DrillQueryItem[]).map((d) => ({
              id: d.id,
              scenario: d.scenario,
              score: d.score,
              time_s: d.time_s,
              reached: d.reached,
              created_at: d.created_at,
              user_name: Array.isArray(d.profiles)
                ? d.profiles[0]?.display_name || "Siswa"
                : d.profiles?.display_name || "Siswa",
            }));
            setSchoolDrills(formatted);
          }
        });

      // 4. Fetch school's latest assessment recommendations
      sb.from("assessments")
        .select("result")
        .eq("school_id", targetSchoolId)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data?.[0]?.result) {
            setSchoolRecs(parseAssessment(data[0].result)?.recommendations ?? []);
          }
        });
    }
  }, [me.profile.id, me.profile.school_id]);

  const handlePersistRole = async () => {
    setSavingRole(true);
    setSaveRoleNotice(null);
    try {
      const { error: err } = await supabase()
        .from("profiles")
        .update({ role: activeRole })
        .eq("id", me.profile.id);
      if (err) throw err;
      setCurrentProfileRole(activeRole);
      setSaveRoleNotice(`Peran profil berhasil diperbarui menjadi ${ROLE_LABEL[activeRole]}.`);
      setTimeout(() => setSaveRoleNotice(null), 3000);
    } catch {
      setSaveRoleNotice("Gagal menyimpan peran ke profil.");
    } finally {
      setSavingRole(false);
    }
  };

  const ranked = useMemo(() => {
    if (!rows) return [];
    return rows
      .map((r) => ({ row: r, exp: exposure(r) }))
      .sort((a, b) => b.exp * (100 - (b.row.readiness ?? 0)) - a.exp * (100 - (a.row.readiness ?? 0)));
  }, [rows]);

  const filteredSchools = useMemo(() => {
    if (pemdaFilter === "all") return ranked;
    if (pemdaFilter === "rawan") return ranked.filter((s) => (s.row.readiness ?? 0) < 45);
    if (pemdaFilter === "penguatan") return ranked.filter((s) => (s.row.readiness ?? 0) >= 45 && (s.row.readiness ?? 0) < 70);
    return ranked.filter((s) => (s.row.readiness ?? 0) >= 70);
  }, [ranked, pemdaFilter]);

  if (error) return <Notice tone="error">Gagal memuat data sekolah: {error}</Notice>;
  if (!rows) return <Notice>Memuat data sekolah…</Notice>;
  if (rows.length === 0) return <Notice>Belum ada sekolah terdaftar. Jalankan supabase/schema.sql untuk data contoh.</Notice>;

  const current = ranked.find((r) => r.row.id === selected) ?? ranked[0];
  const userSchoolRow = rows.find((r) => r.id === me.profile.school_id) ?? current.row;
  const withReadiness = rows.filter((r) => r.readiness !== null);
  const avgReadiness = withReadiness.length
    ? Math.round(withReadiness.reduce((s, r) => s + r.readiness!, 0) / withReadiness.length)
    : null;
  const totalDrills = rows.reduce((s, r) => s + (r.drills ?? 0), 0);
  const cell = "px-3 py-2.5";

  return (
    <div className="mt-6 space-y-8">
      {/* Role Switcher Toolbar */}
      <section aria-label="Pemilihan Peran Pengguna" className="rounded-xl border border-malam-3 bg-malam-2 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-redup">Pilih Sudut Pandang Peran:</span>
            <p className="text-xs text-redup">
              Jelajahi antarmuka khusus yang disesuaikan untuk setiap pemangku kepentingan keselamatan sekolah.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["siswa", "guru", "kepala_sekolah", "pemda"] as const).map((r) => {
              const Icon = ROLE_ICONS[r];
              const isActive = activeRole === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setActiveRole(r)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                    isActive
                      ? "bg-fajar text-malam shadow-md shadow-fajar/20"
                      : "border border-malam-3 bg-malam text-pasir hover:border-redup"
                  }`}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {ROLE_LABEL[r]}
                  {currentProfileRole === r && (
                    <span className="ml-1 rounded bg-black/20 px-1.5 py-0.2 text-[10px]">
                      Profil
                    </span>
                  )}
                </button>
              );
            })}

            {activeRole !== currentProfileRole && (
              <button
                type="button"
                onClick={handlePersistRole}
                disabled={savingRole}
                className="flex items-center gap-1.5 rounded-lg border border-fajar/40 bg-fajar/10 px-3 py-2 text-xs font-bold text-fajar hover:bg-fajar/20 disabled:opacity-50"
              >
                <Save className="size-3.5" aria-hidden="true" />
                {savingRole ? "Menyimpan…" : "Jadikan Peran Default"}
              </button>
            )}
          </div>
        </div>

        {saveRoleNotice && (
          <p className="mt-2 text-xs text-aman" role="status">
            {saveRoleNotice}
          </p>
        )}
      </section>

      {/* Role-Specific Views */}
      <section aria-labelledby="role-section-title">
        <h2 id="role-section-title" className="sr-only">
          Modul Khusus {ROLE_LABEL[activeRole]}
        </h2>

        {activeRole === "siswa" && (
          <RoleViewSiswa me={me} school={me.school} drills={myDrills} />
        )}

        {activeRole === "guru" && (
          <RoleViewGuru me={me} school={me.school} drills={schoolDrills} />
        )}

        {activeRole === "kepala_sekolah" && (
          <RoleViewKepalaSekolah
            me={me}
            school={me.school}
            readiness={userSchoolRow.readiness}
            structuralScore={userSchoolRow.structural_score}
            drillScore={userSchoolRow.avg_score}
            totalDrills={userSchoolRow.drills ?? 0}
            recommendations={schoolRecs}
          />
        )}

        {activeRole === "pemda" && (
          <RoleViewPemda
            me={me}
            schools={ranked.map(({ row, exp }) => ({ ...row, exposure: exp }))}
            filter={pemdaFilter}
            onFilterChange={setPemdaFilter}
          />
        )}
      </section>

      {/* 3D GIS Regional Map & Priority Section */}
      <section className="space-y-6 pt-4 border-t border-malam-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-pasir">Pemetaan Risiko & Kesiapsiagaan Sekolah Indonesia</h2>
            <p className="text-xs text-redup">
              Visualisasi geospasial 3D memperlihatkan tinggi paparan bahaya dan tingkat kesiapan sekolah binaan.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="overflow-hidden rounded-lg border border-malam-3">
            <div className="h-96 sm:h-[32rem]">
              <IndonesiaMap
                schools={filteredSchools.map(({ row, exp }) => ({
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

        <div aria-labelledby="prioritas">
          <h3 id="prioritas" className="text-xl font-bold">
            Urutan prioritas intervensi
          </h3>
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
                {filteredSchools.map(({ row, exp }) => {
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
                    {filteredSchools.length} sekolah
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
        </div>
      </section>
    </div>
  );
}

export default function Dashboard() {
  return <RequireAuth>{(me) => <Board me={me} />}</RequireAuth>;
}

"use client";

import { Building2, GraduationCap, Landmark, Users } from "lucide-react";
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
import { ROLE_LABEL, supabase, type Profile, type Role, type School } from "@/lib/supabase";
import RoleViewGuru, { type SchoolDrillItem } from "@/components/dashboard/RoleViewGuru";
import RoleViewKepalaSekolah from "@/components/dashboard/RoleViewKepalaSekolah";
import RoleViewPemda from "@/components/dashboard/RoleViewPemda";
import RoleViewSiswa, { type DrillRecord } from "@/components/dashboard/RoleViewSiswa";
import { Meter, NO_DATA, STATUS, StatusLabel, secondaryBtn, statusOf } from "@/components/dashboard/ui";

const IndonesiaMap = dynamic(() => import("@/components/dashboard/IndonesiaMap"), {
  ssr: false,
  loading: () => <div role="status" aria-label="Memuat peta" className="skeleton h-full rounded-none" />,
});

// The board's outline while the account and schools load, so the page does not jump when they arrive.
function Skeleton() {
  return (
    <div className="mt-8">
      <p role="status" className="sr-only">
        Memuat data sekolah…
      </p>
      <div aria-hidden="true" className="space-y-10">
        <div className="flex flex-wrap gap-2 border-b border-malam-3 pb-6">
          {["w-28", "w-24", "w-44", "w-52"].map((w) => (
            <span key={w} className={`skeleton h-11 ${w}`} />
          ))}
        </div>
        <div className="flex items-center gap-4">
          <span className="skeleton size-16 shrink-0 rounded-full sm:size-20" />
          <span className="skeleton h-10 w-full max-w-md" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="skeleton h-28 rounded-lg" />
            ))}
          </div>
          <span className="skeleton h-64 rounded-lg" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <span className="skeleton h-96 rounded-lg sm:h-[32rem]" />
          <span className="skeleton h-96 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

type Row = School & {
  drills: number | null;
  participants: number | null;
  avg_score: number | null;
  structural_score: number | null;
  readiness: number | null;
};

// Worst of a reference quake (M 6.5) and a 1 m tidal flood.
function exposure(s: School) {
  const main = { floors: s.floors, material: s.material, built_year: s.built_year };
  const site = { soil: s.soil, coast_km: s.coast_km, rain_30d_mm: s.rain_30d_mm };
  return Math.max(
    structureRisk(main, site, { kind: "gempa", intensity: 6.5 }),
    structureRisk(main, site, { kind: "banjir", intensity: 1 }),
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
    <section aria-labelledby="detail-title" className="space-y-5 rounded-lg border border-malam-3 bg-malam-2 p-5 shadow-edge">
      <h2 id="detail-title" className="text-xl font-bold">
        {row.name}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-redup">Wilayah</dt>
        <dd>{row.region}</dd>
        <dt className="text-redup">Status</dt>
        <dd>
          <StatusLabel readiness={row.readiness} />
        </dd>
        <dt className="text-redup">Ancaman</dt>
        <dd>{row.hazards.join(", ")}</dd>
        <dt className="text-redup">Latihan</dt>
        <dd className="tabular-nums">{row.drills ? `${row.drills} kali oleh ${row.participants ?? 0} peserta` : "Belum ada"}</dd>
      </dl>
      <div className="space-y-4">
        <Meter label="Indeks kesiapan" value={row.readiness} max={100} />
        <Meter label="Rata-rata skor latihan" value={row.avg_score} max={1200} />
        <Meter label="Skor gladi ruang" value={row.structural_score} max={100} />
        <Meter label="Paparan risiko (tinggi = rentan)" value={exp} max={100} />
      </div>
      <div>
        <h3 className="font-bold">Rencana tindak lanjut gladi terakhir</h3>
        {error ? (
          <p role="alert" className="mt-2 text-bahaya">
            {error}
          </p>
        ) : !recs ? (
          <div role="status" aria-label="Memuat rencana" className="mt-3 space-y-2">
            <span className="skeleton block h-4" />
            <span className="skeleton block h-4 w-2/3" />
          </div>
        ) : recs.length === 0 ? (
          <p className="mt-2 text-redup">
            Belum ada.{" "}
            <Link href="/gladi" className="font-semibold text-langit underline decoration-langit/40 underline-offset-4 hover:decoration-langit">
              Jalankan gladi ruang
            </Link>{" "}
            untuk menyusunnya.
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
      <Link href={`/sekolah?room=${row.id}`} className={secondaryBtn}>
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
        .select("id, scenario, score, time_s, reached, created_at, profiles(display_name, avatar)")
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
              profiles: Pick<Profile, "display_name" | "avatar"> | Pick<Profile, "display_name" | "avatar">[] | null;
            };
            const formatted: SchoolDrillItem[] = (data as unknown as DrillQueryItem[]).map((d) => {
              const who = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
              return {
                id: d.id,
                scenario: d.scenario,
                score: d.score,
                time_s: d.time_s,
                reached: d.reached,
                created_at: d.created_at,
                user_name: who?.display_name || "Siswa",
                user_avatar: who?.avatar ?? 0,
              };
            });
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
      setSaveRoleNotice(`Peran profil kini ${ROLE_LABEL[activeRole].toLowerCase()}.`);
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
  if (!rows) return <Skeleton />;
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
    <div className="mt-8 space-y-10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-malam-3 pb-6">
        <div role="group" aria-label="Lihat dasbor sebagai" className="flex flex-wrap gap-2">
          {(["siswa", "guru", "kepala_sekolah", "pemda"] as const).map((r) => {
            const Icon = ROLE_ICONS[r];
            return (
              <button
                key={r}
                type="button"
                aria-pressed={activeRole === r}
                onClick={() => setActiveRole(r)}
                className="group inline-flex min-h-11 items-center gap-2 rounded-md border border-malam-3 px-4 font-semibold transition-colors duration-300 ease-crisp hover:border-redup aria-pressed:border-laut aria-pressed:bg-laut aria-pressed:text-white"
              >
                <Icon className="size-4" aria-hidden="true" />
                {ROLE_LABEL[r]}
                {currentProfileRole === r && (
                  <>
                    <span aria-hidden="true" title="Peran di profilmu" className="size-1.5 rounded-full bg-langit group-aria-pressed:bg-white" />
                    <span className="sr-only">(peran di profilmu)</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {activeRole !== currentProfileRole && (
          <button type="button" onClick={handlePersistRole} disabled={savingRole} className="min-h-11 px-2 font-semibold text-langit hover:underline disabled:opacity-50">
            {savingRole ? "Menyimpan…" : `Jadikan ${ROLE_LABEL[activeRole].toLowerCase()} peran profilku`}
          </button>
        )}
        {saveRoleNotice && (
          <p className="text-aman" role="status">
            {saveRoleNotice}
          </p>
        )}
      </div>

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
            gladiScore={userSchoolRow.structural_score}
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
      <section aria-labelledby="peta" className="space-y-6 border-t border-malam-3 pt-10">
        <h2 id="peta" className="text-3xl font-extrabold tracking-tight">
          Peta kesiapan sekolah
        </h2>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="track self-start overflow-hidden rounded-lg border border-malam-3 shadow-edge">
            <div className="h-96 sm:h-[32rem]">
              <IndonesiaMap
                schools={filteredSchools.map(({ row, exp }) => ({
                  id: row.id,
                  name: row.name,
                  lat: row.lat,
                  lon: row.lon,
                  exposure: exp,
                  color: statusOf(row.readiness).hex,
                }))}
                selected={current.row.id}
                onSelect={setSelected}
              />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-malam-3 bg-malam-2 px-4 py-3">
              {[...STATUS, NO_DATA].map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  <s.Icon aria-hidden="true" className="size-4" style={{ color: s.color }} />
                  {s.label}
                </span>
              ))}
              <span className="text-redup">Tinggi kolom: paparan risiko. Seret untuk memutar, klik kolom untuk memilih.</span>
            </div>
          </div>
          <Detail key={current.row.id} row={current.row} exp={current.exp} />
        </div>

        <div aria-labelledby="prioritas">
          <h3 id="prioritas" className="text-2xl font-bold">
            Urutan prioritas intervensi
          </h3>
          <div className="mt-4 overflow-x-auto rounded-lg border border-malam-3 shadow-edge">
            <table className="w-full text-left sm:min-w-[40rem]">
              <thead className="border-b border-malam-3 bg-malam-2 text-redup">
                <tr>
                  <th scope="col" className={`${cell} font-medium`}>Sekolah</th>
                  <th scope="col" className={`${cell} font-medium max-sm:hidden`}>Wilayah</th>
                  <th scope="col" className={`${cell} font-medium`}>Status</th>
                  <th scope="col" className={`${cell} text-right font-medium`}>Kesiapan</th>
                  <th scope="col" className={`${cell} text-right font-medium max-sm:hidden`}>Paparan</th>
                  <th scope="col" className={`${cell} text-right font-medium max-sm:hidden`}>Latihan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-malam-3">
                {filteredSchools.map(({ row, exp }) => {
                  const active = row.id === current.row.id;
                  return (
                    <tr key={row.id} className={`transition-colors duration-200 ${active ? "bg-laut/10" : "hover:bg-malam-2/60"}`}>
                      <th scope="row" className={`p-0 font-semibold ${active ? "shadow-[inset_2px_0_0_var(--color-laut)]" : ""}`}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelected(row.id)}
                          className={`${cell} block min-h-11 w-full text-left transition-colors hover:text-langit`}
                        >
                          {row.name}
                        </button>
                      </th>
                      <td className={`${cell} text-redup max-sm:hidden`}>{row.region}</td>
                      <td className={cell}>
                        <StatusLabel readiness={row.readiness} />
                      </td>
                      <td className={`${cell} text-right tabular-nums`}>{row.readiness ?? "–"}</td>
                      <td className={`${cell} text-right tabular-nums max-sm:hidden`}>{exp}</td>
                      <td className={`${cell} text-right tabular-nums max-sm:hidden`}>{row.drills ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-malam-3">
                <tr>
                  <th scope="row" className={`${cell} font-semibold`}>
                    {filteredSchools.length} sekolah
                  </th>
                  <td className={`${cell} max-sm:hidden`} />
                  <td className={cell} />
                  <td className={`${cell} text-right tabular-nums`}>{avgReadiness ?? "–"}</td>
                  <td className={`${cell} max-sm:hidden`} />
                  <td className={`${cell} text-right tabular-nums max-sm:hidden`}>{totalDrills}</td>
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
  return <RequireAuth loading={<Skeleton />}>{(me) => <Board me={me} />}</RequireAuth>;
}

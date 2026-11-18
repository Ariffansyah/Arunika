"use client";

import { Compass, Footprints, ShieldAlert, ShieldCheck } from "lucide-react";
import CampusPlan from "@/components/CampusPlan";
import { num } from "@/lib/format";
import type { DrillResult } from "./drillStore";

export default function DebriefingTrail({ result }: { result: DrillResult }) {
  const trail = result.trail;
  const start = trail.length > 0 ? trail[0] : null;
  const finish = trail.length > 0 ? trail[trail.length - 1] : null;

  const efficiency =
    result.walked > 0
      ? Math.min(100, Math.round((result.optimalLen / Math.max(result.walked, result.optimalLen)) * 100))
      : 100;

  const pace = num(result.walked / Math.max(1, result.timeS), 1);

  const feedback = result.caught
    ? {
        title: "Evakuasi terhenti",
        desc: "Kamu terkena bahaya sebelum berhasil mencapai titik aman. Ingat untuk merunduk dan jauhi bahaya sekunder.",
        tone: "bahaya",
        Icon: ShieldAlert,
      }
    : !result.reached
      ? {
          title: "Belum sampai titik kumpul",
          desc: "Latihan diakhiri sebelum kamu tiba di titik kumpul. Ikuti jalur terbaik di peta pada latihan berikutnya.",
          tone: "pasir",
          Icon: Compass,
        }
      : efficiency >= 85
        ? {
            title: "Jalur sangat efisien dan terarah",
            desc: "Kamu mengambil rute evakuasi langsung menuju titik kumpul tanpa banyak memutar.",
            tone: "aman",
            Icon: ShieldCheck,
          }
        : efficiency >= 60
          ? {
              title: "Berhasil, dengan sedikit memutar",
              desc: "Kamu berhasil keluar, namun ada rute memutar yang menambah waktu evakuasi di zona risiko.",
              tone: "pasir",
              Icon: Compass,
            }
          : {
              title: "Rute memutar jauh",
              desc: "Jarak tempuhmu jauh melebihi jalur evakuasi optimal. Perhatikan rambu evakuasi hijau di koridor.",
              tone: "fajar",
              Icon: Footprints,
            };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-pasir">
          <Footprints className="size-4 text-fajar" aria-hidden="true" />
          Jejak evakuasimu
        </h3>
        {result.reached && (
          <span className="text-redup">
            Efisiensi rute <strong className="tabular-nums text-pasir">{efficiency}%</strong>
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-malam-3 bg-malam-2 shadow-inner">
        <CampusPlan labels={1.3} path={result.route} label="Jejak langkah evakuasimu dan jalur terbaik di denah sekolah">
          {trail.length > 1 && (
            <polyline
              points={trail.map(([x, z]) => `${x},${z}`).join(" ")}
              fill="none"
              stroke="#1e63f0"
              strokeWidth={0.8}
              strokeOpacity={0.45}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {trail.length > 1 && (
            <polyline
              points={trail.map(([x, z]) => `${x},${z}`).join(" ")}
              fill="none"
              stroke="#22ccee"
              strokeWidth={0.45}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {start && (
            <g transform={`translate(${start[0]}, ${start[1]})`}>
              <circle r={1.2} fill="#eaf1ff" fillOpacity={0.25} />
              <circle r={0.65} fill="#eaf1ff" stroke="#071530" strokeWidth={0.2} />
              <text textAnchor="middle" dy="0.28" fontSize="0.7" fill="#071530" fontWeight="bold">
                M
              </text>
            </g>
          )}

          {finish && (
            <g transform={`translate(${finish[0]}, ${finish[1]})`}>
              <circle
                r={1.2}
                fill={result.reached ? "#34c47c" : "#ff6b6b"}
                fillOpacity={0.25}
              />
              <circle
                r={0.65}
                fill={result.reached ? "#34c47c" : "#ff6b6b"}
                stroke="#071530"
                strokeWidth={0.2}
              />
              <text textAnchor="middle" dy="0.28" fontSize="0.7" fill="#071530" fontWeight="bold">
                {result.reached ? "★" : "✕"}
              </text>
            </g>
          )}
        </CampusPlan>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-redup">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-4 rounded-full bg-langit" aria-hidden="true" />
          Jejakmu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-fajar" aria-hidden="true" />
          Jalur terbaik
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-pasir" aria-hidden="true" />
          Mulai
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block size-2.5 rounded-full ${result.reached ? "bg-aman" : "bg-bahaya"}`} aria-hidden="true" />
          {result.reached ? "Selesai" : "Berhenti"}
        </span>
      </div>

      <div className="rounded-md border border-malam-3 bg-malam-2 p-3">
        <div className="flex items-start gap-2.5">
          <feedback.Icon
            aria-hidden="true"
            className={`mt-0.5 size-4 shrink-0 ${
              feedback.tone === "aman"
                ? "text-aman"
                : feedback.tone === "bahaya"
                  ? "text-bahaya"
                  : feedback.tone === "fajar"
                    ? "text-fajar"
                    : "text-pasir"
            }`}
          />
          <div className="space-y-1">
            <p className="font-semibold text-pasir">{feedback.title}</p>
            <p className="text-redup">{feedback.desc}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pt-1 text-redup">
              <span>
                Ditempuh <strong className="tabular-nums text-pasir">{num(result.walked)} m</strong>
              </span>
              <span>
                Jalur terbaik <strong className="tabular-nums text-pasir">{num(result.optimalLen)} m</strong>
              </span>
              <span>
                Laju <strong className="tabular-nums text-pasir">{pace} m/detik</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

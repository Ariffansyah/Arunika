"use client";

import { Compass, Footprints, ShieldAlert, ShieldCheck } from "lucide-react";
import CampusPlan from "@/components/CampusPlan";
import type { DrillResult } from "./drillStore";

export default function DebriefingTrail({ result }: { result: DrillResult }) {
  const trail = result.trail;
  const start = trail.length > 0 ? trail[0] : null;
  const finish = trail.length > 0 ? trail[trail.length - 1] : null;

  // Efficiency calculation: optimal route length vs walked distance
  const efficiency =
    result.walked > 0
      ? Math.min(100, Math.round((result.optimalLen / Math.max(result.walked, result.optimalLen)) * 100))
      : 100;

  // Evacuation pace (meters per second)
  const pace = (result.walked / Math.max(1, result.timeS)).toFixed(1);

  // Evaluative feedback according to BNPB principles
  const feedback = result.caught
    ? {
        title: "Evakuasi Terhenti",
        desc: "Kamu terkena bahaya sebelum berhasil mencapai titik aman. Ingat untuk merunduk dan jauhi bahaya sekunder.",
        tone: "bahaya",
        Icon: ShieldAlert,
      }
    : efficiency >= 85
      ? {
          title: "Jalur Sangat Efisien & Terarah",
          desc: "Kamu mengambil rute evakuasi langsung menuju titik kumpul tanpa banyak memutar.",
          tone: "aman",
          Icon: ShieldCheck,
        }
      : efficiency >= 60
        ? {
            title: "Evakuasi Berhasil dengan Sedikit Deviasi",
            desc: "Kamu berhasil keluar, namun ada rute memutar yang menambah waktu evakuasi di zona risiko.",
            tone: "pasir",
            Icon: Compass,
          }
        : {
            title: "Rute Memutar Jauh",
            desc: "Jarak tempuhmu jauh melebihi jalur evakuasi optimal. Perhatikan rambu evakuasi hijau di koridor.",
            tone: "fajar",
            Icon: Footprints,
          };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-pasir">
          <Footprints className="size-4 text-fajar" aria-hidden="true" />
          Evaluasi Jejak Evakuasi (Debriefing)
        </h3>
        <span className="text-xs font-medium text-redup">
          Efisiensi Rute: <strong className="text-pasir">{efficiency}%</strong>
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-malam-3 bg-malam-2 shadow-inner">
        <CampusPlan path={result.route} label="Visualisasi jejak langkah evakuasi siswa dan rute optimal">
          {/* Subtle glow layer behind the trail */}
          {trail.length > 1 && (
            <polyline
              points={trail.map(([x, z]) => `${x},${z}`).join(" ")}
              fill="none"
              stroke="#0284c7"
              strokeWidth={0.8}
              strokeOpacity={0.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Player walking trail: bright cyan */}
          {trail.length > 1 && (
            <polyline
              points={trail.map(([x, z]) => `${x},${z}`).join(" ")}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={0.45}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Start marker: green badge with outer pulse */}
          {start && (
            <g transform={`translate(${start[0]}, ${start[1]})`}>
              <circle r={1.2} fill="#22c55e" fillOpacity={0.25} />
              <circle r={0.65} fill="#22c55e" stroke="#071530" strokeWidth={0.2} />
              <text textAnchor="middle" dy="0.28" fontSize="0.7" fill="#ffffff" fontWeight="bold">
                S
              </text>
            </g>
          )}

          {/* Finish marker: flag/target pin */}
          {finish && (
            <g transform={`translate(${finish[0]}, ${finish[1]})`}>
              <circle
                r={1.2}
                fill={result.caught ? "#ef4444" : "#f59e0b"}
                fillOpacity={0.25}
              />
              <circle
                r={0.65}
                fill={result.caught ? "#ef4444" : "#f59e0b"}
                stroke="#071530"
                strokeWidth={0.2}
              />
              <text textAnchor="middle" dy="0.28" fontSize="0.7" fill="#ffffff" fontWeight="bold">
                {result.caught ? "✕" : "★"}
              </text>
            </g>
          )}
        </CampusPlan>
      </div>

      {/* Visual Legend */}
      <div className="grid grid-cols-2 gap-2 text-xs text-redup sm:grid-cols-4">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-4 rounded-full bg-[#38bdf8]" aria-hidden="true" />
          Jejak Langkah
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-4 rounded-full border-t-2 border-dashed border-[#ff8a3d]" aria-hidden="true" />
          Jalur Terbaik
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-[#22c55e]" aria-hidden="true" />
          Posisi Mulai (S)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-[#f59e0b]" aria-hidden="true" />
          Titik Berhenti (★)
        </span>
      </div>

      {/* Evaluative Analysis Card */}
      <div className="rounded-md border border-malam-3 bg-malam-2 p-3 text-xs">
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
                Jarak Tempuh: <strong className="text-pasir">{result.walked.toFixed(0)} m</strong>
              </span>
              <span>
                Jarak Ideal: <strong className="text-pasir">{result.optimalLen.toFixed(0)} m</strong>
              </span>
              <span>
                Laju Evakuasi: <strong className="text-pasir">{pace} m/detik</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

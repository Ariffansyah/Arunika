"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, Layers, Link2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CampusPlan from "@/components/CampusPlan";
import { H, MAP, TILE, W } from "@/lib/campus";
import { MAPS } from "@/lib/maps";
import { INTENSITY, SCENARIO_LABEL, waterLevel, within, type Scenario } from "@/lib/sim";
import { supabase, type School } from "@/lib/supabase";
import { aftershockAt, finishDrill, input, player, run, setState, shakingAt, showHint, useDrill, type DrillResult } from "./drillStore";
import { interact } from "./interact";
import { rumble, siren } from "./sound";
import type { Peer } from "./useRoom";

const panel = "rounded-lg border border-malam-3 bg-malam/92 p-4 shadow-lg";
const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-semibold active:translate-y-px disabled:opacity-60";
const primary = `${btn} bg-fajar text-malam hover:bg-fajar-tua`;
const ghost = `${btn} border border-malam-3 text-pasir hover:border-redup`;

export const ROOM_PATTERN = /^[a-z0-9-]{3,40}$/i;

function useDrillClock() {
  const phase = useDrill((s) => s.phase);
  const startAt = useDrill((s) => s.startAt);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => setT((Date.now() - startAt) / 1000);
    // First reading on the next frame, so a new drill never shows the previous drill's time.
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [phase, startAt]);
  return phase === "running" ? t : 0;
}

// The player's spot on a plan, moved every frame without re-rendering.
function useYouDot() {
  const dot = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      dot.current?.setAttribute("cx", String(player.x / TILE));
      dot.current?.setAttribute("cy", String(player.z / TILE));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return dot;
}

function MapOverlay() {
  const dot = useYouDot();
  return (
    <div
      role="dialog"
      aria-label="Peta evakuasi"
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-malam/70 p-4"
      onClick={() => setState({ mapOpen: false })}
    >
      <div className={`${panel} w-full max-w-2xl space-y-3`} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Peta evakuasi</h2>
        <div className="overflow-hidden rounded-md border border-malam-3">
          <CampusPlan label="Peta evakuasi kampus dengan titik kumpul dan posisi kamu">
            <circle ref={dot} r={0.9} fill="#ff8a3d" stroke="#0d1828" strokeWidth={0.3} cx={W / 2} cy={H / 2} />
          </CampusPlan>
        </div>
        <p className="text-redup">Hijau titik kumpul, jingga posisi kamu.</p>
        <button type="button" className={`${primary} w-full`} onClick={() => setState({ mapOpen: false })}>
          Tutup peta
        </button>
      </div>
    </div>
  );
}

function Minimap() {
  const dot = useYouDot();
  const route = useDrill((s) => (s.showRoute ? s.route : null));
  return (
    <div className="w-28 overflow-hidden rounded-md border border-malam-3 sm:w-52">
      <CampusPlan path={route?.map(([x, , z]) => [x / TILE, z / TILE])} label="Peta mini kampus dengan posisi kamu">
        <circle ref={dot} r={0.8} fill="#f4ecdc" stroke="#0d1828" strokeWidth={0.3} cx={W / 2} cy={H / 2} />
      </CampusPlan>
    </div>
  );
}

const campusUrl = (room: string, map: string) => `/kampus?room=${encodeURIComponent(room)}&peta=${map}`;
const radio =
  "flex min-h-11 items-center justify-center rounded-md text-center border border-malam-3 px-3 text-sm font-semibold has-checked:border-fajar has-checked:text-fajar has-focus-visible:outline-2 has-focus-visible:outline-fajar";

function ScenarioPicker({ room, onStart }: { room: string; onStart: (s: Scenario) => void }) {
  const scenario = useDrill((s) => s.scenario);
  const meta = INTENSITY[scenario.kind];
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(scenario);
      }}
    >
      <fieldset>
        <legend className="text-sm font-semibold">Peta</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {Object.values(MAPS).map((m) => (
            <label key={m.id} className={radio}>
              <input
                type="radio"
                name="peta"
                className="sr-only"
                checked={MAP.id === m.id}
                // The layout is fixed for a page load, so another map is another page.
                onChange={() => location.assign(campusUrl(room, m.id))}
              />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">Skenario</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {MAP.disasters.map((k) => (
            <label key={k} className={radio}>
              <input
                type="radio"
                name="kind"
                className="sr-only"
                checked={scenario.kind === k}
                onChange={() => setState({ scenario: { kind: k, intensity: INTENSITY[k].start } })}
              />
              {SCENARIO_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold" htmlFor="intensity">
        {`${meta.label}: ${scenario.intensity.toFixed(meta.step < 1 ? 1 : 0)} ${meta.unit}`.trim()}
        <input
          id="intensity"
          type="range"
          min={meta.range[0]}
          max={meta.range[1]}
          step={meta.step}
          value={scenario.intensity}
          onChange={(e) => setState({ scenario: { ...scenario, intensity: Number(e.target.value) } })}
          className="mt-2 block w-full accent-fajar"
        />
      </label>
      <button type="submit" className={`${primary} w-full`}>
        Mulai simulasi
      </button>
      <p className="leading-loose text-redup">
        Gerak <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> · Lari <kbd>Shift</kbd> · Aksi <kbd>E</kbd> · Merunduk <kbd>C</kbd> · Lompat{" "}
        <kbd>Spasi</kbd> · Peta <kbd>M</kbd> · Kamera <kbd>V</kbd> · Seret layar untuk melihat
      </p>
    </form>
  );
}

function Instruction({ t }: { t: number }) {
  const scenario = useDrill((s) => s.scenario);
  const hint = useDrill((s) => s.showRoute);
  const report = useDrill((s) => s.prompt?.id === "lapor");
  if (t < 0)
    return (
      <p className="text-lg font-extrabold leading-snug">
        {run.situation?.brief} <span className="tabular-nums text-fajar">Mulai {Math.ceil(-t)}…</span>
      </p>
    );
  const { wind, slide } = run.timeline;
  const shaking = scenario.kind === "gempa" && shakingAt(t);
  const after = scenario.kind === "gempa" && aftershockAt(t);
  const storm = within(wind, t);
  const sliding = slide !== null && t >= slide;
  // The clock re-renders this ten times a second, often enough to follow the water at the player's feet.
  const message =
    scenario.kind === "gempa"
      ? shaking
        ? "Gempa! Berlindung di bawah meja (E), lindungi kepala, bertahan."
        : after
          ? "Gempa susulan! Merunduk di tempat terbuka dan lindungi kepala (C)."
          : report
            ? "Sudah di titik kumpul. Lapor ke petugas (E)."
            : "Guncangan berhenti. Keluar dengan tertib, jangan berlari, menuju titik kumpul."
      : scenario.kind === "angin"
        ? storm
          ? "Angin melintas! Jauhi jendela, merunduk dan lindungi kepala (C)."
          : report
            ? "Angin sudah reda. Lapor ke guru (E)."
            : wind && t >= wind[1]
              ? "Angin sudah reda. Tunggu di ruang aman, lalu lapor ke guru."
              : "Angin puting beliung mendekat. Masuk ke ruang tanpa jendela di gedung kokoh: toilet, tangga, atau Tata Usaha."
        : scenario.kind === "longsor"
          ? report
            ? "Sudah di titik kumpul. Lapor ke petugas (E)."
            : sliding
              ? "Longsor! Jauhi lereng, menuju titik kumpul di lapangan."
              : "Hujan deras di lereng. Periksa tanda longsor dari jauh (E), bunyikan kentongan, lalu menjauh ke lapangan."
          : report
            ? "Sudah di tempat aman. Lapor (E)."
            : player.wading
              ? "Air setinggi lutut. Cari jalan yang lebih tinggi."
              : "Air naik. Matikan listrik bila sempat, lalu naik ke bukit atau lantai 2 Gedung Kelas A.";
  return (
    <div className="space-y-3">
      <p role="status" className={`font-bold leading-snug ${shaking || after || storm || (sliding && !report) ? "text-bahaya" : "text-fajar"}`}>
        {message}
      </p>
      <p className="tabular-nums text-redup">
        Waktu {t.toFixed(1)} dtk
        {scenario.kind === "banjir" && <> · Tinggi air {waterLevel(scenario, t, run.timeline.rise).toFixed(2)} m</>}
        {wind && t < wind[0] && <> · Angin tiba {Math.ceil(wind[0] - t)} dtk</>}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} onClick={showHint} disabled={hint}>
          {hint ? "Jalur AI ditampilkan" : "Tampilkan jalur AI (−150 poin)"}
        </button>
        <button type="button" className={ghost} onClick={() => finishDrill(false)}>
          Akhiri latihan
        </button>
      </div>
    </div>
  );
}

type Row = { score: number; time_s: number; profiles: { display_name: string } | { display_name: string }[] | null };

function Results({ result, room, schoolId }: { result: DrillResult; room: string; schoolId: string | null }) {
  const [board, setBoard] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startAt = useDrill((s) => s.startAt);
  const saved = useRef(0);

  useEffect(() => {
    if (saved.current === startAt) return;
    saved.current = startAt;
    (async () => {
      const sb = supabase();
      const { data } = await sb.auth.getUser();
      const { error: insertError } = await sb.from("drill_results").insert({
        user_id: data.user?.id,
        school_id: schoolId,
        room,
        scenario: result.scenario.kind,
        map: MAP.id,
        intensity: result.scenario.intensity,
        score: result.score,
        time_s: Math.round(result.timeS * 10) / 10,
        reached: result.reached,
      });
      if (insertError) throw insertError;
      const { data: rows, error } = await sb
        .from("drill_results")
        .select("score, time_s, profiles(display_name)")
        .eq("room", room)
        .eq("map", MAP.id)
        .eq("scenario", result.scenario.kind)
        .not("user_id", "is", null)
        .order("score", { ascending: false })
        .limit(5);
      if (error) throw error;
      setBoard(rows as Row[]);
    })()
      // Supabase throws plain objects that carry a message, not Error instances.
      .catch((e) => setError(typeof e?.message === "string" ? e.message : String(e)));
  }, [result, room, schoolId, startAt]);

  const lines: [string, string][] = [
    ["Skenario", SCENARIO_LABEL[result.scenario.kind]],
    ["Waktu", `${result.timeS.toFixed(1)} dtk`],
    ["Jarak", `${result.walked.toFixed(0)} m, jalur optimal ${result.optimalLen.toFixed(0)} m (garis jingga)`],
    ["Jalur AI", result.hintUsed ? "Dipakai (−150)" : "Tidak dipakai"],
  ];

  return (
    <div className="space-y-4">
      <p className="text-2xl font-extrabold">
        Skor <span className="tabular-nums text-fajar">{result.score}</span> poin
      </p>
      <ul className="space-y-1">
        {result.checks.map((c) => (
          <li key={c.label} className="flex items-start justify-between gap-3">
            <span className="flex items-start gap-2">
              {c.ok ? (
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-aman" />
              ) : (
                <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-bahaya" />
              )}
              <span>
                <span className="sr-only">{c.ok ? "Benar: " : "Belum: "}</span>
                {c.label}
              </span>
            </span>
            <span className="tabular-nums text-redup">
              {c.got}/{c.max}
            </span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {lines.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-redup">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="font-bold">Peringkat ruang ini</h3>
        {error ? (
          <p role="alert" className="mt-1 text-bahaya">
            Gagal menyimpan atau memuat peringkat: {error}
          </p>
        ) : !board ? (
          <p role="status" className="mt-1 text-redup">
            Menyimpan skor…
          </p>
        ) : board.length === 0 ? (
          <p className="mt-1 text-redup">Belum ada skor di ruang ini.</p>
        ) : (
          <ol className="mt-1 space-y-0.5">
            {board.map((r, i) => {
              const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
              return (
                <li key={i} className="flex justify-between gap-4">
                  <span>
                    {i + 1}. {p?.display_name ?? "Tamu"}
                  </span>
                  <span className="tabular-nums">{r.score}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <button type="button" className={`${primary} w-full`} onClick={() => setState({ phase: "idle", showRoute: false, result: null })}>
        Latihan lagi
      </button>
    </div>
  );
}

function TouchPad() {
  const prompt = useDrill((s) => s.prompt);
  const canJump = useDrill((s) => s.vaultAt !== null);
  const hold = (k: keyof typeof input) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      input[k] = true;
    },
    onPointerUp: () => (input[k] = false),
    onPointerCancel: () => (input[k] = false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const pad = "flex size-12 items-center justify-center rounded-md bg-malam/85 text-pasir active:bg-malam-3 touch-none select-none";
  return (
    <div className="pointer-events-auto absolute right-3 bottom-3 hidden grid-cols-[3rem_auto_3rem] justify-items-center gap-1 pointer-coarse:grid">
      <button
        type="button"
        onClick={interact}
        disabled={!prompt}
        className={`${pad} col-span-3 w-full px-3 text-sm font-bold disabled:opacity-50`}
      >
        {prompt?.label ?? "Aksi"}
      </button>
      <button type="button" className={`${pad} text-xs font-bold`} {...hold("run")}>
        Lari
      </button>
      <button type="button" aria-label="Maju" className={pad} {...hold("up")}>
        <ChevronUp aria-hidden="true" />
      </button>
      <span />
      <button type="button" aria-label="Kiri" className={pad} {...hold("left")}>
        <ChevronLeft aria-hidden="true" />
      </button>
      <button type="button" className={`${pad} w-auto px-2.5 text-xs font-bold`} {...hold("crouch")}>
        Merunduk
      </button>
      <button type="button" aria-label="Kanan" className={pad} {...hold("right")}>
        <ChevronRight aria-hidden="true" />
      </button>
      {canJump ? (
        <button type="button" className={`${pad} text-xs font-bold`} onClick={() => (input.jump = true)}>
          Lompat
        </button>
      ) : (
        <span />
      )}
      <button type="button" aria-label="Mundur" className={pad} {...hold("down")}>
        <ChevronDown aria-hidden="true" />
      </button>
    </div>
  );
}

export default function Hud({
  room,
  peers,
  status,
  school,
  onStart,
}: {
  room: string;
  peers: Peer[];
  status: "connecting" | "online" | "offline";
  school: School | null;
  onStart: (s: Scenario) => void;
}) {
  const phase = useDrill((s) => s.phase);
  const scenario = useDrill((s) => s.scenario);
  const startAt = useDrill((s) => s.startAt);
  const result = useDrill((s) => s.result);
  const showRisk = useDrill((s) => s.showRisk);
  const view = useDrill((s) => s.view);
  const mapOpen = useDrill((s) => s.mapOpen);
  const t = useDrillClock();
  const router = useRouter();
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    if (phase !== "running") return;
    const at = (s: number) => Math.max(0, startAt + s * 1000 - Date.now());
    const { shake, aftershock, wind, slide } = run.timeline;
    const ids = [setTimeout(() => siren(), at(shake?.[1] ?? 0))];
    if (shake) ids.push(setTimeout(() => rumble(shake[1]), at(0)));
    if (aftershock) ids.push(setTimeout(() => rumble(aftershock[1] - aftershock[0]), at(aftershock[0])));
    // The same low roar stands in for the whirlwind passing and the slope giving way.
    if (wind) ids.push(setTimeout(() => rumble(wind[1] - wind[0]), at(wind[0])));
    if (slide !== null) ids.push(setTimeout(() => rumble(6), at(slide)));
    return () => ids.forEach(clearTimeout);
  }, [phase, startAt, scenario.kind]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className={`${panel} pointer-events-auto min-w-0 max-w-xs space-y-2 text-sm`}>
          <div className="flex items-center gap-3">
            <Link href="/" className="font-extrabold text-pasir">
              Arunika<span className="text-fajar">.</span>
            </Link>
            <span className="text-redup">
              {school?.name ?? "Kampus contoh"} · {MAP.name}
            </span>
          </div>
          <p>
            Ruang <strong>{room.length > 12 ? `${room.slice(0, 8)}…` : room}</strong> ·{" "}
            <span className={status === "online" ? "text-aman" : status === "offline" ? "text-bahaya" : "text-redup"}>
              {status === "online" ? `${peers.length + 1} orang` : status === "offline" ? "terputus" : "menyambung…"}
            </span>
          </p>
          {peers.length > 0 && <p className="text-redup">Bersama {peers.map((p) => p.name).join(", ")}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${ghost} min-h-9 px-3`}
              onClick={() =>
                // The clipboard API is missing on plain-http pages; that throws synchronously, so start from a promise.
                Promise.resolve()
                  .then(() => navigator.clipboard.writeText(`${location.origin}${campusUrl(room, MAP.id)}`))
                  .then(() => setCopied("ok"))
                  .catch(() => setCopied("fail"))
              }
            >
              <Link2 aria-hidden="true" className="size-4" />
              {copied === "ok" ? "Tautan disalin" : copied === "fail" ? "Gagal menyalin" : "Salin tautan"}
            </button>
          </div>
          <form
            className="hidden gap-2 sm:flex"
            onSubmit={(e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("room")).trim();
              if (ROOM_PATTERN.test(code)) router.push(campusUrl(code, MAP.id));
            }}
          >
            <label htmlFor="room" className="sr-only">
              Kode ruang lain
            </label>
            <input
              id="room"
              name="room"
              placeholder="kode-ruang, mis. kelas-7a"
              pattern="[A-Za-z0-9\-]{3,40}"
              required
              className="min-h-9 w-full min-w-0 rounded-md border border-malam-3 bg-malam-2 px-2 placeholder:text-redup"
            />
            <button type="submit" className={`${ghost} min-h-9 px-3`}>
              Pindah
            </button>
          </form>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <Minimap />
          <button
            type="button"
            aria-pressed={showRisk}
            onClick={() => setState({ showRisk: !showRisk })}
            className={`${btn} min-h-10 border px-3 text-sm ${showRisk ? "border-fajar bg-fajar text-malam" : "border-malam-3 bg-malam/90 text-pasir hover:border-redup"}`}
          >
            <Layers aria-hidden="true" className="size-4" />
            <span className="sm:hidden">Risiko AI</span>
            <span className="hidden sm:inline">Lapisan risiko AI</span>
          </button>
          <button
            type="button"
            aria-pressed={view === "first"}
            onClick={() => setState({ view: view === "first" ? "third" : "first" })}
            className={`${btn} min-h-10 border px-3 text-sm ${view === "first" ? "border-fajar bg-fajar text-malam" : "border-malam-3 bg-malam/90 text-pasir hover:border-redup"}`}
          >
            <Eye aria-hidden="true" className="size-4" />
            <span className="sr-only sm:not-sr-only">Orang pertama</span>
          </button>
        </div>
      </div>

      <div className={`${panel} pointer-events-auto max-h-[70dvh] w-full max-w-sm overflow-y-auto text-sm pointer-coarse:mb-[14rem]`}>
        {phase === "idle" && <ScenarioPicker room={room} onStart={onStart} />}
        {phase === "running" && <Instruction t={t} />}
        {phase === "done" && result && <Results result={result} room={room} schoolId={school?.id ?? null} />}
      </div>
      <TouchPad />
      {mapOpen && <MapOverlay />}
    </div>
  );
}

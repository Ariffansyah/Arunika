"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, Layers, Link2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CampusPlan from "@/components/CampusPlan";
import { H, W } from "@/lib/campus";
import { INTENSITY, QUAKE_SHAKE_S, SCENARIO_LABEL, waterLevel, type Scenario } from "@/lib/sim";
import { supabase, type School } from "@/lib/supabase";
import { finishDrill, input, player, setState, showHint, useDrill, type DrillResult } from "./drillStore";
import type { Peer } from "./useRoom";

const panel = "rounded-lg border border-malam-3 bg-malam/92 p-4 shadow-lg";
const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-semibold active:translate-y-px disabled:opacity-60";
const primary = `${btn} bg-fajar text-malam hover:bg-fajar-tua`;
const ghost = `${btn} border border-malam-3 text-pasir hover:border-redup`;

export const ROOM_PATTERN = /^[a-z0-9-]{3,40}$/i;

// Two-tone siren from an oscillator: no audio file to ship or license.
function siren(seconds = 3) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    gain.gain.value = 0.06;
    for (let t = 0; t < seconds; t += 0.5) osc.frequency.setValueAtTime(t % 1 ? 640 : 880, ctx.currentTime + t);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
    osc.onended = () => ctx.close();
    // A drill started by someone else arrives without a click here, so the context may begin suspended.
    void ctx.resume();
  } catch {
    // Audio is a cue, not a requirement; the on-screen instruction carries the same message.
  }
}

function rumble(seconds: number) {
  try {
    const ctx = new AudioContext();
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 140;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.55, now + 0.4);
    gain.gain.setValueAtTime(0.55, now + seconds - 1);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    src.connect(low).connect(gain).connect(ctx.destination);
    src.start();
    src.onended = () => ctx.close();
    void ctx.resume();
  } catch {
    // Sound is a cue only; the shaking camera and the instruction carry the same message.
  }
}

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

function Minimap() {
  const dot = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      dot.current?.setAttribute("cx", String(player.x));
      dot.current?.setAttribute("cy", String(player.z));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  const route = useDrill((s) => (s.showRoute ? s.route : null));
  return (
    <div className="w-28 overflow-hidden rounded-md border border-malam-3 sm:w-52">
      <CampusPlan route={route ?? undefined} label="Peta mini kampus dengan posisi kamu">
        <circle ref={dot} r={0.8} fill="#f4ecdc" stroke="#0d1828" strokeWidth={0.3} cx={W / 2} cy={H / 2} />
      </CampusPlan>
    </div>
  );
}

function ScenarioPicker({ onStart }: { onStart: (s: Scenario) => void }) {
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
        <legend className="text-sm font-semibold">Skenario</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["gempa", "banjir"] as const).map((k) => (
            <label
              key={k}
              className="flex min-h-11 items-center justify-center rounded-md border border-malam-3 px-3 text-sm font-semibold has-checked:border-fajar has-checked:text-fajar has-focus-visible:outline-2 has-focus-visible:outline-fajar"
            >
              <input
                type="radio"
                name="kind"
                className="sr-only"
                checked={scenario.kind === k}
                onChange={() => setState({ scenario: { kind: k, intensity: k === "gempa" ? 6.5 : 1 } })}
              />
              {SCENARIO_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold" htmlFor="intensity">
        {`${meta.label}: ${scenario.intensity.toFixed(1)} ${meta.unit}`.trim()}
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
        Gerak <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> · Seret layar untuk melihat · Kamera <kbd>V</kbd> · Merunduk{" "}
        <kbd>C</kbd> · Tanya petugas <kbd>E</kbd>
      </p>
    </form>
  );
}

function Instruction({ t }: { t: number }) {
  const scenario = useDrill((s) => s.scenario);
  const hint = useDrill((s) => s.showRoute);
  if (t < 0) return <p className="text-2xl font-extrabold">Bersiap… {Math.ceil(-t)}</p>;
  const shaking = scenario.kind === "gempa" && t < QUAKE_SHAKE_S;
  return (
    <div className="space-y-3">
      <p role="status" className={`font-bold leading-snug ${shaking ? "text-bahaya" : "text-fajar"}`}>
        {scenario.kind === "gempa"
          ? shaking
            ? "Gempa! Merunduk, lindungi kepala, bertahan. Tahan C atau tombol Merunduk."
            : "Guncangan berhenti. Jauhi gedung dan menuju titik kumpul yang aman."
          : "Air laut naik. Segera menuju tempat yang lebih tinggi."}
      </p>
      <p className="tabular-nums text-redup">
        Waktu {t.toFixed(1)} dtk
        {scenario.kind === "banjir" && <> · Tinggi air {waterLevel(scenario, t).toFixed(2)} m</>}
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
        .eq("scenario", result.scenario.kind)
        .not("user_id", "is", null)
        .order("score", { ascending: false })
        .limit(5);
      if (error) throw error;
      setBoard(rows as Row[]);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [result, room, schoolId, startAt]);

  const lines: [string, string][] = [
    ["Skenario", SCENARIO_LABEL[result.scenario.kind]],
    ["Hasil", result.reached ? "Sampai di titik kumpul" : "Tidak sampai di titik kumpul aman"],
    ["Waktu", `${result.timeS.toFixed(1)} dtk`],
    ["Jarak ditempuh", `${result.walked.toFixed(0)} petak (jalur optimal ${result.optimalLen.toFixed(0)})`],
    ["Di zona bahaya", `${result.hazardS.toFixed(1)} dtk`],
    ...(result.scenario.kind === "gempa"
      ? [["Berlindung saat guncangan", `${Math.min(result.coverS, QUAKE_SHAKE_S).toFixed(1)} / ${QUAKE_SHAKE_S} dtk`] as [string, string]]
      : []),
    ["Bantuan jalur AI", result.hintUsed ? "Dipakai (−150)" : "Tidak dipakai"],
    ["Jalur optimal", "Garis jingga di peta"],
  ];

  return (
    <div className="space-y-4">
      <p className="text-2xl font-extrabold">
        Skor <span className="tabular-nums text-fajar">{result.score}</span> poin
      </p>
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
      <span />
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
      <span />
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
  const t = useDrillClock();
  const router = useRouter();
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    if (phase !== "running") return;
    const quake = scenario.kind === "gempa";
    const ids = [setTimeout(() => siren(), Math.max(0, startAt + (quake ? QUAKE_SHAKE_S * 1000 : 0) - Date.now()))];
    if (quake) ids.push(setTimeout(() => rumble(QUAKE_SHAKE_S), Math.max(0, startAt - Date.now())));
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
            <span className="text-redup">{school?.name ?? "Kampus contoh"}</span>
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
                  .then(() => navigator.clipboard.writeText(`${location.origin}/kampus?room=${encodeURIComponent(room)}`))
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
              if (ROOM_PATTERN.test(code)) router.push(`/kampus?room=${encodeURIComponent(code)}`);
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

      <div className={`${panel} pointer-events-auto w-full max-w-sm text-sm pointer-coarse:mb-[10.5rem]`}>
        {phase === "idle" && <ScenarioPicker onStart={onStart} />}
        {phase === "running" && <Instruction t={t} />}
        {phase === "done" && result && <Results result={result} room={room} schoolId={school?.id ?? null} />}
      </div>
      <TouchPad />
    </div>
  );
}

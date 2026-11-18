"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Eye, Layers, Link2, Map as MapIcon, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CampusPlan from "@/components/CampusPlan";
import DebriefingTrail from "./DebriefingTrail";
import { H, MAP, TILE, W } from "@/lib/campus";
import { PLAN } from "@/lib/floorplan";
import { MAPS } from "@/lib/maps";
import { INTENSITY, SCENARIO_LABEL, waterLevel, within, type Scenario } from "@/lib/sim";
import { supabase, type School } from "@/lib/supabase";
import { aftershockAt, fallenAt, finishDrill, input, liveChecks, player, run, setState, shakingAt, showHint, useDrill, type DrillResult } from "./drillStore";
import SimControls from "./Controls";
import { interact } from "./interact";
import Learn from "./Learn";
import { KindPicker, NpcPicker, ToolButton, ghost, panel, primary, radio } from "./ui";
import { falloff, isMuted, play, rumble, setMuted, siren } from "./sound";
import type { Peer } from "./useRoom";


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
            <circle ref={dot} r={0.9} fill="#ff8a3d" stroke="#071530" strokeWidth={0.3} cx={W / 2} cy={H / 2} />
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
    <div className="hidden w-44 overflow-hidden rounded-lg border border-malam-3 shadow-lg sm:block lg:w-52">
      <CampusPlan path={route?.map(([x, , z]) => [x / TILE, z / TILE])} label="Peta mini kampus dengan posisi kamu">
        <circle ref={dot} r={0.8} fill="#eaf1ff" stroke="#071530" strokeWidth={0.3} cx={W / 2} cy={H / 2} />
      </CampusPlan>
    </div>
  );
}

const campusUrl = (room: string, map: string) => `/kampus?room=${encodeURIComponent(room)}&peta=${map}`;

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
      <KindPicker legend="Skenario" />
      <NpcPicker />
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
          className="mt-2 block w-full accent-langit"
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

// The checklist as it stands, for the guided practice: done, broken, or still to come.
function LiveChecks() {
  return (
    <ul className="space-y-1">
      {liveChecks().map((c) => (
        <li key={c.label} className={`flex items-start gap-2 ${c.pending ? "text-redup" : ""}`}>
          {c.pending ? (
            <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : c.ok ? (
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-aman" />
          ) : (
            <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-bahaya" />
          )}
          <span>
            <span className="sr-only">{c.pending ? "Belum: " : c.ok ? "Sudah: " : "Terlewat: "}</span>
            {c.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

type Tone = "danger" | "done" | "info";

// What to do right now, and how urgent it is. The clock re-renders the HUD ten times a second, often enough to
// follow the water at the player's feet.
function objective(kind: Scenario["kind"], t: number, report: boolean): { message: string; tone: Tone } {
  const { wind, slide } = run.timeline;
  const shaking = kind === "gempa" && shakingAt(t);
  const after = kind === "gempa" && aftershockAt(t);
  const storm = within(wind, t);
  const sliding = slide !== null && t >= slide;
  const message =
    kind === "gempa"
      ? shaking
        ? "Gempa! Berlindung di bawah meja (E), lindungi kepala, bertahan."
        : after
          ? "Gempa susulan! Merunduk di tempat terbuka dan lindungi kepala (C)."
          : report
            ? "Sudah di titik kumpul. Lapor ke petugas (E)."
            : "Guncangan berhenti. Keluar dengan tertib, jangan berlari, menuju titik kumpul."
      : kind === "angin"
        ? storm
          ? "Angin melintas! Jauhi jendela, merunduk dan lindungi kepala (C)."
          : report
            ? "Angin sudah reda. Lapor ke guru (E)."
            : wind && t >= wind[1]
              ? "Angin sudah reda. Tunggu di ruang aman, lalu lapor ke guru."
              : "Angin puting beliung mendekat. Masuk ke ruang tanpa jendela di gedung kokoh: toilet, tangga, atau Tata Usaha."
        : kind === "longsor"
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
  return { message, tone: shaking || after || storm || (sliding && !report) ? "danger" : report ? "done" : "info" };
}

const TONE: Record<Tone, string> = { danger: "bg-bahaya", done: "bg-aman", info: "bg-pasir" };

// The one line that matters mid-drill, at the top like a mission objective; it slides in fresh when it changes.
function Objective({ message, tone }: { message: string; tone: Tone }) {
  return (
    <div role="status" className="[grid-area:goal] md:justify-self-center">
      <p key={message} className={`animate-rise rounded-lg px-4 py-3 text-center font-bold leading-snug text-malam shadow-lg md:text-lg ${TONE[tone]}`}>
        {message}
      </p>
    </div>
  );
}

const hudGhost = `${ghost} min-h-10 bg-malam/90 px-3 text-sm shadow-lg`;

// The clock and what is coming, the way out of the drill, and in practice the checklist. On phones these fall into
// the grid around the objective; from md up they stack in the left column.
function DrillSide({ t }: { t: number }) {
  const scenario = useDrill((s) => s.scenario);
  const hint = useDrill((s) => s.showRoute);
  const guided = useDrill((s) => s.guided);
  const { wind } = run.timeline;
  return (
    <div className="contents md:flex md:flex-col md:items-start md:gap-2 md:[grid-area:left]">
      <p className="pointer-events-auto rounded-lg border border-malam-3 bg-malam/90 px-3 py-2 text-sm font-semibold tabular-nums shadow-lg [grid-area:status] justify-self-start">
        <span className="max-sm:hidden">{SCENARIO_LABEL[scenario.kind]} · </span>
        {t.toFixed(1)} dtk
        {scenario.kind === "banjir" && <> · Tinggi air {waterLevel(scenario, t, run.timeline.rise).toFixed(2)} m</>}
        {wind && t < wind[0] && <> · Angin tiba {Math.ceil(wind[0] - t)} dtk</>}
      </p>
      <div className="pointer-events-auto flex flex-wrap gap-2 [grid-area:acts]">
        {!guided && (
          <button type="button" className={hudGhost} onClick={showHint} disabled={hint}>
            {hint ? "Jalur AI ditampilkan" : "Jalur AI (−150 poin)"}
          </button>
        )}
        <button type="button" className={hudGhost} onClick={() => finishDrill(false)}>
          Akhiri latihan
        </button>
      </div>
      {guided && (
        <div className={`${panel} pointer-events-auto max-w-xs text-sm [grid-area:list]`}>
          <LiveChecks />
        </div>
      )}
    </div>
  );
}

// The countdown is the establishing shot: the situation in large type while the camera flies down to the player.
function Countdown({ t }: { t: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <p role="status" className="max-w-xl animate-rise rounded-xl bg-malam/85 px-6 py-5 text-center text-2xl font-extrabold leading-snug shadow-lg sm:text-3xl">
        {run.situation?.brief} <span className="tabular-nums text-fajar">{Math.ceil(-t)}</span>
      </p>
    </div>
  );
}

// Why a drill ended early, first in the checklist.
function Caught({ result }: { result: DrillResult }) {
  if (!result.caught) return null;
  return (
    <li className="flex items-start gap-2 font-semibold text-bahaya">
      <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {result.scenario.kind === "longsor" ? "Tertimbun longsor" : "Tertimpa gedung yang runtuh"}
    </li>
  );
}

function GuidedResults({ result, onStart }: { result: DrillResult; onStart: () => void }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <h2 id="results-title" className="text-2xl font-extrabold">
          Latihan selesai
        </h2>
        <ul className="space-y-1">
          <Caught result={result} />
          {result.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              {c.ok ? <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-aman" /> : <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-bahaya" />}
              <span>
                <span className="sr-only">{c.ok ? "Benar: " : "Belum: "}</span>
                {c.label}
              </span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 pt-2">
          <button type="button" autoFocus className={primary} onClick={onStart}>
            Mulai simulasi berwaktu
          </button>
          <button type="button" className={ghost} onClick={() => setState({ phase: "idle", showRoute: false, result: null })}>
            Kembali belajar
          </button>
        </div>
      </div>
      <div>
        <DebriefingTrail result={result} />
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
    ["Jarak", `${result.walked.toFixed(0)} m, jalur terbaik ${result.optimalLen.toFixed(0)} m`],
    ["Jalur AI", result.hintUsed ? "Dipakai (−150)" : "Tidak dipakai"],
  ];

  // The verdict and what to do again on the left; where you went and how the room did on the right.
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <h2 id="results-title" className="text-3xl font-extrabold">
          Skor <span className="tabular-nums text-fajar">{result.score}</span> poin
        </h2>
        <ul className="space-y-1">
          <Caught result={result} />
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
        <button type="button" autoFocus className={`${primary} w-full`} onClick={() => setState({ phase: "idle", showRoute: false, result: null })}>
          Latihan lagi
        </button>
      </div>
      <div className="space-y-4">
        <DebriefingTrail result={result} />
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
      </div>
    </div>
  );
}

// What E (or a click) does right now and whether Space jumps, under the middle of the screen as in any game;
// touch screens show the same on the pad. The crosshair marks the middle in first person.
function ActionPrompt() {
  const prompt = useDrill((s) => s.prompt);
  const canJump = useDrill((s) => s.vaultAt !== null);
  const first = useDrill((s) => s.view === "first");
  const key = "rounded border border-malam/30 px-1.5 text-xs";
  return (
    <div className="contents pointer-coarse:hidden">
      {first && <div aria-hidden="true" className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-pasir ring-1 ring-malam/60 portrait:top-[30%]" />}
      <div className="absolute top-[58%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 portrait:top-[38%]">
        {prompt && (
          <button
            type="button"
            onClick={interact}
            className="pointer-events-auto flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md bg-pasir px-3 text-sm font-semibold text-malam shadow-lg hover:bg-white active:translate-y-px"
          >
            <kbd className={key}>E</kbd>
            {prompt.label}
          </button>
        )}
        {canJump && (
          <span className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-pasir/90 px-2 py-1 text-xs font-semibold text-malam">
            <kbd className={key}>Spasi</kbd>
            Lompati
          </span>
        )}
      </div>
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
  const idle = useDrill((s) => s.phase === "idle");
  const pad = "flex size-12 items-center justify-center rounded-md bg-malam/85 text-pasir active:bg-malam-3 touch-none select-none";
  // On phones the menu sheet covers the bottom of the screen until a drill starts.
  return (
    <div
      className={`pointer-events-auto absolute right-3 bottom-3 hidden grid-cols-[3rem_auto_3rem] justify-items-center gap-1 pointer-coarse:grid ${idle ? "max-sm:hidden!" : ""}`}
    >
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
  onGuided,
}: {
  room: string;
  peers: Peer[];
  status: "connecting" | "online" | "offline";
  school: School | null;
  onStart: (s: Scenario) => void;
  onGuided: (s: Scenario) => void;
}) {
  const phase = useDrill((s) => s.phase);
  const guided = useDrill((s) => s.guided);
  const [tab, setTab] = useState<"belajar" | "simulasi">("belajar");
  const [muted, setMutedState] = useState(isMuted);
  const scenario = useDrill((s) => s.scenario);
  const startAt = useDrill((s) => s.startAt);
  const result = useDrill((s) => s.result);
  const showRisk = useDrill((s) => s.showRisk);
  const view = useDrill((s) => s.view);
  const mapOpen = useDrill((s) => s.mapOpen);
  const t = useDrillClock();
  const report = useDrill((s) => s.prompt?.id === "lapor");

  // In the guided practice the route follows the player, so it always starts underfoot.
  useEffect(() => {
    if (phase !== "running" || !guided) return;
    const id = setInterval(showHint, 1000);
    return () => clearInterval(id);
  }, [phase, guided]);

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
    // Things breaking nearby, each heard from where it happens: windows, toppling cupboards, the fallen tree, rocks.
    const from = (x: number, z: number) => falloff(Math.hypot(x - player.x, z - player.z));
    run.breaks.forEach((when, i) => ids.push(setTimeout(() => play("glass", 0.5 * from(PLAN.panes[i].x, PLAN.panes[i].z)), at(when))));
    run.falls.forEach((when, i) => ids.push(setTimeout(() => play("crash", 0.7 * from(PLAN.items[i].x, PLAN.items[i].z)), at(when + 0.5))));
    const f = run.situation?.fallen;
    if (f && Number.isFinite(fallenAt())) ids.push(setTimeout(() => play("crash", from(f.x, f.z)), at(fallenAt() + 1.2)));
    const lane = MAP.runouts[run.lane];
    if (slide !== null && lane) for (let k = 0; k < 8; k++) ids.push(setTimeout(() => play("rock", from(lane.bx, lane.bz)), at(slide + 0.6 * k)));
    run.collapses.forEach(({ at: when }, b) => {
      const fp = PLAN.footprint[b];
      const [x, z] = [(fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2];
      for (let k = 0; k < 4; k++) ids.push(setTimeout(() => play("crash", from(x, z) * (1 - k * 0.2)), at(when + k * 0.45)));
    });
    // Three ticks before the start.
    for (let k = 1; k <= 3; k++) ids.push(setTimeout(() => play("tick", 0.5), Math.max(0, startAt - k * 1000 - Date.now())));
    return () => ids.forEach(clearTimeout);
  }, [phase, startAt, scenario.kind]);

  const { message, tone } = objective(scenario.kind, t, report);
  const danger = phase === "running" && t >= 0 && tone === "danger";

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Danger tints the edges of the screen, so it is felt without reading the banner. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 shadow-[inset_0_0_9rem_1rem_rgb(255_107_107/0.45)] transition-opacity duration-500 ${danger ? "opacity-100 motion-safe:animate-pulse" : "opacity-0"}`}
      />
      {phase === "idle" && (
        <section
          aria-label="Menu simulasi"
          className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[62dvh] flex-col rounded-t-xl border-t border-malam-3 bg-malam/95 text-sm shadow-lg sm:inset-y-0 sm:right-auto sm:max-h-none sm:w-[25rem] sm:rounded-none sm:border-t-0 sm:border-r"
        >
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-baseline gap-3">
              <Link href="/" className="text-xl font-extrabold text-pasir">
                Arunika<span className="text-fajar">.</span>
              </Link>
              <span className="truncate text-redup">
                {school?.name ?? "Kampus contoh"} · {MAP.name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-malam-2 p-1">
              {(["belajar", "simulasi"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tab === k}
                  onClick={() => setTab(k)}
                  className="min-h-10 rounded-md font-semibold text-redup hover:text-pasir aria-pressed:bg-malam-3 aria-pressed:text-pasir"
                >
                  {k === "belajar" ? "Belajar" : "Simulasi"}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
            {tab === "belajar" ? (
              <Learn onGuided={() => onGuided(scenario)} onStart={() => onStart(scenario)} />
            ) : (
              <ScenarioPicker room={room} onStart={onStart} />
            )}
          </div>
          <RoomInfo room={room} peers={peers} status={status} />
        </section>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 p-3 [grid-template-areas:'status_tools'_'goal_goal'_'acts_acts'_'list_list'] md:grid-cols-[minmax(0,1fr)_minmax(0,36rem)_minmax(0,1fr)] md:[grid-template-areas:'left_goal_tools']">
        {phase === "running" && t >= 0 && (
          <>
            <DrillSide t={t} />
            <Objective message={message} tone={tone} />
          </>
        )}
        <div className="pointer-events-auto flex flex-col items-end gap-2 justify-self-end [grid-area:tools]">
          <SimControls>
            <ToolButton label="Peta" dialog onClick={() => setState({ mapOpen: true })}>
              <MapIcon aria-hidden="true" />
            </ToolButton>
            <ToolButton label="Risiko AI" pressed={showRisk} onClick={() => setState({ showRisk: !showRisk })}>
              <Layers aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Bisukan"
              pressed={muted}
              onClick={() => {
                setMuted(!muted);
                setMutedState(!muted);
              }}
            >
              {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </ToolButton>
            <ToolButton label="Orang pertama" pressed={view === "first"} onClick={() => setState({ view: view === "first" ? "third" : "first" })}>
              <Eye aria-hidden="true" />
            </ToolButton>
          </SimControls>
          {phase !== "done" && <Minimap />}
        </div>
      </div>
      {phase === "running" && t < 0 && <Countdown t={t} />}
      <ActionPrompt />
      <TouchPad />
      {phase === "done" && result && (
        <section
          aria-labelledby="results-title"
          className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-malam/70 p-3 sm:p-6"
        >
          <div className={`${panel} max-h-full w-full max-w-4xl overflow-y-auto text-sm sm:p-6`}>
            {result.guided ? (
              <GuidedResults result={result} onStart={() => onStart(result.scenario)} />
            ) : (
              <Results result={result} room={room} schoolId={school?.id ?? null} />
            )}
          </div>
        </section>
      )}
      {mapOpen && <MapOverlay />}
    </div>
  );
}

// Who is in the room and how to bring others in, folded away under the menu until needed.
function RoomInfo({ room, peers, status }: { room: string; peers: Peer[]; status: "connecting" | "online" | "offline" }) {
  const router = useRouter();
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <details className="group border-t border-malam-3 px-4 py-2 sm:px-5">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>
          Ruang <strong>{room.length > 12 ? `${room.slice(0, 8)}…` : room}</strong> ·{" "}
          <span className={status === "online" ? "text-aman" : status === "offline" ? "text-bahaya" : "text-redup"}>
            {status === "online" ? `${peers.length + 1} orang` : status === "offline" ? "terputus" : "menyambung…"}
          </span>
        </span>
        <ChevronUp aria-hidden="true" className="size-4 text-redup transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 pt-1 pb-2">
        {peers.length > 0 && <p className="text-redup">Bersama {peers.map((p) => p.name).join(", ")}</p>}
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
        <form
          className="flex gap-2"
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
    </details>
  );
}

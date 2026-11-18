"use client";

import { Mic, Send, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MAP, tileAt } from "@/lib/campus";
import { HAZARD_LABEL } from "@/lib/gladi";
import { buildingAt } from "@/lib/nav";
import { authHeader, type School } from "@/lib/supabase";
import type { WardenContext } from "@/lib/warden";
import { getState, player, predict, setState, useDrill, warden } from "./drillStore";

type Msg = { role: "user" | "model"; text: string };

// What the warden should know about this school and this student; the server checks every id against the maps.
function context(school: School | null): WardenContext {
  const s = getState();
  const r = s.result;
  return {
    peta: MAP.id,
    kind: s.scenario.kind,
    goals: predict(s.scenario, school, new Date().getFullYear()).goals.map((g) => tileAt(...g)),
    near: buildingAt(player.x, player.z),
    last: r && !r.guided ? { kind: r.scenario.kind, score: r.score, reached: r.reached, missed: r.checks.filter((c) => !c.ok).map((c) => c.label) } : null,
  };
}

type Recognition = { lang: string; start(): void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null };
const getRecognition = (): (new () => Recognition) | undefined =>
  typeof window === "undefined"
    ? undefined
    : ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Recognition) | undefined;

function speak(text: string) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "id-ID";
  warden.talking = true;
  u.onend = u.onerror = () => (warden.talking = false);
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("id"));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

export default function WardenChat({ school, name }: { school: School | null; name: string }) {
  const open = useDrill((s) => s.chatOpen);
  const kind = useDrill((s) => s.scenario.kind);
  const result = useDrill((s) => s.result);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const canListen = useSyncExternalStore(
    () => () => {},
    () => Boolean(getRecognition()),
    () => false,
  );
  const canSpeak = useSyncExternalStore(
    () => () => {},
    () => "speechSynthesis" in window,
    () => false,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setState({ chatOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  async function send(question: string) {
    const q = question.trim().slice(0, 2000);
    if (!q || busy) return;
    const history: Msg[] = [...msgs, { role: "user" as const, text: q }].slice(-20);
    setMsgs([...history, { role: "model", text: "" }]);
    setText("");
    setBusy(true);
    setError(null);
    warden.talking = true;
    let reply = "";
    try {
      const res = await fetch("/api/warden", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ messages: history, context: context(school) }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMsgs([...history, { role: "model", text: reply }]);
      }
      if (voice && canSpeak && reply) speak(reply);
    } catch (e) {
      setMsgs(history);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      // A reply being read aloud keeps the warden talking until the voice ends.
      if (!("speechSynthesis" in window) || !(speechSynthesis.speaking || speechSynthesis.pending)) warden.talking = false;
    }
  }

  function listen() {
    const R = getRecognition();
    if (!R) return;
    const r = new R();
    r.lang = "id-ID";
    r.onresult = (e) => send(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    setListening(true);
    r.start();
  }

  if (!open) return null;
  const hazard = HAZARD_LABEL[kind].toLowerCase();
  const suggestions = [
    ...(result && !result.guided ? ["Apa yang kurang dari latihanku tadi?"] : []),
    `Ke mana aku harus pergi kalau ${hazard}?`,
    `Apa yang pertama kulakukan saat ${hazard}?`,
    "Apa saja isi tas siaga bencana?",
  ].slice(0, 3);

  return (
    <aside
      aria-labelledby="warden-title"
      className="absolute inset-x-3 bottom-3 top-24 z-40 flex flex-col rounded-lg border border-malam-3 bg-malam/96 shadow-xl sm:inset-x-auto sm:right-3 sm:w-96"
    >
      <header className="flex items-center gap-2 border-b border-malam-3 p-3">
        <h2 id="warden-title" className="mr-auto font-bold">
          Petugas Keselamatan (AI)
        </h2>
        {canSpeak && (
        <button
          type="button"
          aria-pressed={voice}
          aria-label={voice ? "Matikan suara jawaban" : "Bacakan jawaban"}
          onClick={() => {
            if (voice) speechSynthesis.cancel();
            setVoice(!voice);
          }}
          className="flex size-11 items-center justify-center rounded-md hover:bg-malam-3"
        >
          {voice ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
        </button>
        )}
        <button
          type="button"
          aria-label="Tutup percakapan"
          onClick={() => setState({ chatOpen: false })}
          className="flex size-11 items-center justify-center rounded-md hover:bg-malam-3"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div ref={listRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-3 text-sm leading-relaxed">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="mr-4 rounded-md bg-malam-2 px-3 py-2">
              Halo, {name}. Aku petugas keselamatan {school?.name ?? "sekolah ini"}. Tanya apa saja soal evakuasi di sini,
              pertolongan pertama, atau latihanmu. Kalau ada keadaan darurat sungguhan, hubungi 112.
            </p>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="block min-h-11 w-full rounded-md border border-malam-3 px-3 py-2 text-left hover:border-redup"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <p
            key={i}
            className={`whitespace-pre-wrap rounded-md px-3 py-2 ${m.role === "user" ? "ml-8 bg-malam-3" : "mr-4 bg-malam-2"}`}
          >
            {m.text || (busy && i === msgs.length - 1 ? "Petugas sedang menjawab…" : "")}
          </p>
        ))}
        {error && (
          <p role="alert" className="text-bahaya">
            Petugas tidak bisa dihubungi: {error}
          </p>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-malam-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="warden-input" className="sr-only">
          Pertanyaan untuk petugas
        </label>
        <input
          ref={inputRef}
          id="warden-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder={listening ? "Mendengarkan…" : "Tulis pertanyaan"}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-malam-3 bg-malam-2 px-3 placeholder:text-redup"
        />
        {canListen && (
          <button
            type="button"
            onClick={listen}
            disabled={busy || listening}
            aria-label="Bertanya dengan suara"
            className="flex size-11 items-center justify-center rounded-md border border-malam-3 hover:border-redup disabled:opacity-60"
          >
            <Mic aria-hidden="true" className={listening ? "text-fajar" : ""} />
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Kirim"
          className="flex size-11 items-center justify-center rounded-md bg-laut text-white hover:bg-laut-terang disabled:opacity-60"
        >
          <Send aria-hidden="true" />
        </button>
      </form>
    </aside>
  );
}

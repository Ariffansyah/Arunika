"use client";

import { ImageUp } from "lucide-react";
import { useState } from "react";
import RequireAuth, { type Me } from "@/components/RequireAuth";
import {
  COST_LABEL,
  HAZARDS,
  LEVEL_LABEL,
  PRIORITY_LABEL,
  type Assessment,
} from "@/lib/assessment";
import { authHeader } from "@/lib/supabase";

const MAX_BYTES = 5 * 1024 * 1024;
const HAZARD_LABEL: Record<(typeof HAZARDS)[number], string> = { gempa: "Gempa", banjir: "Banjir / rob", umum: "Umum" };

// Phone photos are often over the limit; 1600px is plenty for the model and keeps uploads small.
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal memproses foto."))), "image/jpeg", 0.85),
  );
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; assessment: Assessment; saved: boolean };

function Form({ me }: { me: Me }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(form: FormData) {
    if (!file) return;
    setState({ kind: "loading" });
    try {
      const image = await shrink(file);
      if (image.size > MAX_BYTES) throw new Error("Foto terlalu besar meski sudah diperkecil. Coba foto lain.");
      const hazard = String(form.get("hazard"));
      const body = new FormData();
      body.set("image", image, "foto.jpg");
      body.set("hazard", hazard);
      const res = await fetch("/api/analyze", { method: "POST", headers: await authHeader(), body });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const { assessment, saved } = (await res.json()) as { assessment: Assessment; saved: boolean };
      setState({ kind: "done", assessment, saved });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(new FormData(e.currentTarget));
        }}
      >
        <label
          htmlFor="photo"
          className="flex min-h-48 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-dashed border-malam-3 text-center hover:border-redup has-focus-visible:outline-2 has-focus-visible:outline-fajar"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, nothing to optimise
            <img src={preview} alt="Pratinjau foto bangunan yang dipilih" width={352} height={264} className="h-auto w-full object-cover" />
          ) : (
            <>
              <ImageUp aria-hidden="true" className="size-8 text-redup" />
              <span className="font-semibold">Pilih foto bangunan</span>
              <span className="text-sm text-redup">JPG, PNG, atau WebP</span>
            </>
          )}
          <input
            id="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            required
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (preview) URL.revokeObjectURL(preview);
              setFile(f);
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
        </label>

        <label htmlFor="hazard" className="block text-sm font-medium">
          Nilai ketahanan terhadap
          <select
            id="hazard"
            name="hazard"
            defaultValue="gempa"
            className="mt-1 block min-h-11 w-full rounded-md border border-malam-3 bg-malam-2 px-3"
          >
            {HAZARDS.map((h) => (
              <option key={h} value={h}>
                {HAZARD_LABEL[h]}
              </option>
            ))}
          </select>
        </label>

        <p className="text-sm text-redup">
          Hasil disimpan untuk <strong className="text-pasir">{me.school?.name ?? "tanpa sekolah"}</strong> dan tampil di
          dasbor kesiapan. Fotonya sendiri tidak disimpan.
        </p>

        <button
          type="submit"
          disabled={!file || state.kind === "loading"}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-fajar px-5 font-semibold text-malam hover:bg-fajar-tua active:translate-y-px disabled:opacity-60"
        >
          {state.kind === "loading" ? "Menganalisis foto…" : "Analisis foto ini"}
        </button>
      </form>

      <section aria-labelledby="hasil" aria-busy={state.kind === "loading"}>
        <h2 id="hasil" className="text-xl font-bold">
          Hasil analisis
        </h2>
        {state.kind === "idle" && (
          <p className="mt-3 text-redup">
            Belum ada analisis. Foto yang jelas dan terang, diambil dari jarak 2 sampai 5 meter, memberi hasil terbaik.
          </p>
        )}
        {state.kind === "loading" && (
          <p role="status" className="mt-3 text-redup">
            AI sedang membaca foto. Biasanya butuh 5 sampai 20 detik.
          </p>
        )}
        {state.kind === "error" && (
          <p role="alert" className="mt-3 text-bahaya">
            {state.message}
          </p>
        )}
        {state.kind === "done" && <Result a={state.assessment} saved={state.saved} />}
      </section>
    </div>
  );
}

function Result({ a, saved }: { a: Assessment; saved: boolean }) {
  if (!a.is_building)
    return (
      <p role="alert" className="mt-3 text-bahaya">
        Foto ini tidak tampak memperlihatkan bangunan. Coba foto dinding, kolom, atau atap sekolah.
      </p>
    );
  const tone = a.score >= 70 ? "text-aman" : a.score >= 45 ? "text-fajar" : "text-bahaya";
  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p>
          <span className={`text-5xl font-extrabold ${tone}`}>{a.score}</span>
          <span className="text-redup"> / 100 skor ketahanan</span>
        </p>
        <p className="font-semibold">{LEVEL_LABEL[a.level]}</p>
      </div>
      <div className="h-2 overflow-hidden rounded bg-malam-3" aria-hidden="true">
        <div className="h-full bg-fajar" style={{ width: `${a.score}%` }} />
      </div>
      <p className="leading-relaxed">{a.summary}</p>

      {a.observations.length > 0 && (
        <div>
          <h3 className="font-semibold">Yang terlihat di foto</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-redup">
            {a.observations.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-semibold">Rekomendasi perbaikan</h3>
        {a.recommendations.length === 0 ? (
          <p className="mt-2 text-redup">Tidak ada rekomendasi khusus dari foto ini.</p>
        ) : (
          <ol className="mt-2 divide-y divide-malam-3 rounded-lg border border-malam-3">
            {a.recommendations.map((r) => (
              <li key={r.action} className="space-y-1 p-3">
                <p>{r.action}</p>
                <p className="text-sm text-redup">
                  <span className={r.priority === "segera" ? "font-semibold text-fajar" : ""}>{PRIORITY_LABEL[r.priority]}</span> ·{" "}
                  {COST_LABEL[r.cost_band]}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="text-sm text-redup">
        Penilaian awal dari satu foto oleh AI, bukan pengganti pemeriksaan ahli struktur atau dinas pekerjaan umum.
      </p>
      <p role="status" className={`text-sm ${saved ? "text-aman" : "text-bahaya"}`}>
        {saved ? "Tersimpan ke dasbor kesiapan." : "Hasil tidak tersimpan ke dasbor. Coba analisis ulang nanti."}
      </p>
    </div>
  );
}

export default function Analyzer() {
  return <RequireAuth>{(me) => <Form me={me} />}</RequireAuth>;
}

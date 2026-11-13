"use client";

import { Check, Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AVATARS, ROLE_LABEL, supabase, type Role, type School } from "@/lib/supabase";

const label = "block text-sm font-medium";
const field =
  "mt-1.5 block min-h-12 w-full rounded-md border border-malam-3 bg-malam-2 px-3 text-pasir placeholder:text-redup hover:border-redup focus-visible:border-fajar";
const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-fajar px-5 font-semibold text-malam hover:bg-fajar-tua active:translate-y-px disabled:opacity-60";
const secondary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md border border-malam-3 px-5 font-semibold hover:border-redup active:translate-y-px disabled:opacity-60";

type Stage = "loading" | "auth" | "profile";
type Mode = "masuk" | "daftar";

// Resolve against our own origin so "//host" or "/\host" can't send users to another site.
function safeNext(raw: string | null) {
  try {
    const u = new URL(raw ?? "/kampus", location.origin);
    return u.origin === location.origin ? u.pathname + u.search + u.hash : "/kampus";
  } catch {
    return "/kampus";
  }
}

// Supabase answers in English; translate the cases people actually run into.
function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(m)) return "Email atau kata sandi salah.";
  if (/already registered|already exists/i.test(m)) return "Email ini sudah terdaftar. Pilih Masuk.";
  if (/email not confirmed/i.test(m)) return "Email belum dikonfirmasi. Buka tautan di email kamu dulu.";
  if (/anonymous sign-ins are disabled/i.test(m)) return "Masuk sebagai tamu belum diaktifkan di Supabase.";
  if (/password should be at least/i.test(m)) return "Kata sandi minimal 6 karakter.";
  if (/rate limit|too many/i.test(m)) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (/supabaseUrl is required|supabaseKey is required|failed to fetch/i.test(m))
    return "Tidak bisa terhubung ke server. Periksa koneksi atau konfigurasi Supabase.";
  return m;
}

export default function LoginFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("next");

  const [stage, setStage] = useState<Stage>("loading");
  const [mode, setMode] = useState<Mode>("masuk");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data } = await sb.auth.getSession();
      if (!data.session) return setStage("auth");
      const { data: profile } = await sb.from("profiles").select("id").eq("id", data.session.user.id).maybeSingle();
      if (profile) router.replace(safeNext(raw));
      else setStage("profile");
    })().catch((e) => {
      setError(friendly(e));
      setStage("auth");
    });
  }, [router, raw]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  if (stage === "loading") return <p role="status" className="text-redup">Memeriksa sesi…</p>;
  if (stage === "profile") return <ProfileForm onDone={() => router.replace(safeNext(raw))} />;

  return (
    <div>
      <h1 className="sr-only">Masuk atau daftar</h1>
      <fieldset>
        <legend className="sr-only">Pilih</legend>
        <div className="flex gap-8">
          {(["masuk", "daftar"] as const).map((m) => (
            <label
              key={m}
              className="relative pb-2 text-4xl font-extrabold tracking-tight text-redup hover:text-pasir has-checked:text-pasir has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-fajar"
            >
              <input
                type="radio"
                name="mode"
                className="peer sr-only"
                checked={mode === m}
                onChange={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
              />
              {m === "masuk" ? "Masuk" : "Daftar"}
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-fajar opacity-0 peer-checked:opacity-100" />
            </label>
          ))}
        </div>
      </fieldset>

      <form
        className="mt-10 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const email = String(form.get("email")).trim();
          const password = String(form.get("password"));
          run(async () => {
            const sb = supabase();
            const res =
              mode === "daftar"
                ? await sb.auth.signUp({ email, password })
                : await sb.auth.signInWithPassword({ email, password });
            if (res.error) throw res.error;
            if (!res.data.session) {
              setMode("masuk");
              setNotice(`Akun dibuat. Buka tautan konfirmasi yang dikirim ke ${email}, lalu masuk.`);
              return;
            }
            setStage("profile");
          });
        }}
      >
        <label className={label} htmlFor="email">
          Email
          <input id="email" name="email" type="email" required autoComplete="email" className={field} />
        </label>
        <div>
          <label className={label} htmlFor="password">
            {mode === "daftar" ? "Kata sandi, minimal 6 karakter" : "Kata sandi"}
          </label>
          <div className="relative mt-1.5">
            <input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={6}
              autoComplete={mode === "masuk" ? "current-password" : "new-password"}
              className={`${field} mt-0 pr-12`}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-redup hover:text-pasir"
            >
              {show ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "Memproses…" : mode === "masuk" ? "Masuk" : "Buat akun"}
        </button>
      </form>

      <div aria-hidden="true" className="my-7 flex items-center gap-4 text-redup">
        <span className="h-px flex-1 bg-malam-3" />
        atau
        <span className="h-px flex-1 bg-malam-3" />
      </div>
      <button
        type="button"
        disabled={busy}
        className={secondary}
        onClick={() =>
          run(async () => {
            const { error } = await supabase().auth.signInAnonymously();
            if (error) throw error;
            setStage("profile");
          })
        }
      >
        Coba sebagai tamu
      </button>

      {notice && (
        <p role="status" className="mt-6 text-aman">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 text-bahaya">
          {error}
        </p>
      )}
    </div>
  );
}

function ProfileForm({ onDone }: { onDone: () => void }) {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase()
      .from("schools")
      .select("*")
      .order("name")
      .then(({ data, error }) => (error ? setError(friendly(error)) : setSchools(data)));
  }, []);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        (async () => {
          const sb = supabase();
          const { data } = await sb.auth.getUser();
          if (!data.user) throw new Error("Sesi berakhir, silakan masuk lagi.");
          const { error } = await sb.from("profiles").upsert({
            id: data.user.id,
            display_name: String(form.get("display_name")).trim(),
            avatar: Number(form.get("avatar")),
            school_id: String(form.get("school_id")) || null,
            role: form.get("role") as Role,
          });
          if (error) throw error;
          onDone();
        })()
          .catch((e) => setError(friendly(e)))
          .finally(() => setBusy(false));
      }}
    >
      <h1 className="text-4xl font-extrabold tracking-tight">Lengkapi profil</h1>

      <label className={label} htmlFor="display_name">
        Nama yang dilihat teman
        <input id="display_name" name="display_name" required minLength={2} maxLength={40} autoComplete="nickname" className={field} />
      </label>

      <fieldset>
        <legend className={label}>Karakter</legend>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {AVATARS.map((look, i) => (
            <label key={look} className="relative">
              <input type="radio" name="avatar" value={i} defaultChecked={i === 0} className="peer sr-only" />
              {/* eslint-disable-next-line @next/next/no-img-element -- 64px sprites, nothing to optimise */}
              <img
                src={`/characters/previews/character-${look}.png`}
                alt={`Karakter ${i + 1}`}
                width={64}
                height={64}
                className="aspect-square w-full rounded-md border-2 border-malam-3 bg-malam-2 hover:border-redup peer-checked:border-fajar peer-checked:bg-malam-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fajar"
              />
              <Check
                aria-hidden="true"
                strokeWidth={3}
                className="pointer-events-none absolute top-1 right-1 size-4 rounded-full bg-fajar p-0.5 text-malam opacity-0 peer-checked:opacity-100"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label className={label} htmlFor="school_id">
        Sekolah
        <select id="school_id" name="school_id" required className={field} disabled={!schools}>
          {!schools && <option value="">{error ? "Gagal memuat sekolah" : "Memuat daftar sekolah…"}</option>}
          {schools?.length === 0 && <option value="">Belum ada sekolah. Jalankan supabase/schema.sql.</option>}
          {schools?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.region}
            </option>
          ))}
        </select>
      </label>

      <label className={label} htmlFor="role">
        Peran
        <select id="role" name="role" className={field} defaultValue="siswa">
          {Object.entries(ROLE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={busy || !schools?.length} className={primary}>
        {busy ? "Menyimpan…" : "Simpan dan lanjut"}
      </button>
      {error && (
        <p role="alert" className="text-bahaya">
          {error}
        </p>
      )}
    </form>
  );
}

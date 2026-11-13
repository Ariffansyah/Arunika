"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AVATAR_COLORS, ROLE_LABEL, supabase, type Role, type School } from "@/lib/supabase";

const input =
  "mt-1 block min-h-11 w-full rounded-md border border-malam-3 bg-malam-2 px-3 text-pasir placeholder:text-redup/70 focus-visible:border-fajar";
const primary =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-fajar px-5 font-semibold text-malam hover:bg-fajar-tua active:translate-y-px disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-malam-3 px-5 font-semibold hover:border-redup active:translate-y-px disabled:opacity-60";

type Stage = "loading" | "auth" | "profile";

// Resolve against our own origin so "//host" or "/\host" can't send users to another site.
function safeNext(raw: string | null) {
  try {
    const u = new URL(raw ?? "/kampus", location.origin);
    return u.origin === location.origin ? u.pathname + u.search + u.hash : "/kampus";
  } catch {
    return "/kampus";
  }
}

export default function LoginFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("next");

  const [stage, setStage] = useState<Stage>("loading");
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
      setError(`Supabase belum siap: ${e instanceof Error ? e.message : e}`);
      setStage("auth");
    });
  }, [router, raw]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (stage === "loading") return <p role="status" className="text-redup">Memeriksa sesi…</p>;
  if (stage === "profile") return <ProfileForm onDone={() => router.replace(safeNext(raw))} />;

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Masuk ke Arunika</h1>
      <p className="mt-2 text-redup">Pakai akun sekolahmu, atau masuk sebagai tamu untuk mencoba simulasi.</p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const email = String(form.get("email"));
          const password = String(form.get("password"));
          const signup = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "daftar";
          run(async () => {
            const sb = supabase();
            const res = signup
              ? await sb.auth.signUp({ email, password })
              : await sb.auth.signInWithPassword({ email, password });
            if (res.error) throw res.error;
            if (!res.data.session) return setNotice("Akun dibuat. Buka email konfirmasi, lalu masuk di sini.");
            setStage("profile");
          });
        }}
      >
        <label className="block text-sm font-medium" htmlFor="email">
          Email
          <input id="email" name="email" type="email" required autoComplete="email" className={input} />
        </label>
        <label className="block text-sm font-medium" htmlFor="password">
          Kata sandi
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            className={input}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="submit" value="masuk" disabled={busy} className={primary}>
            Masuk
          </button>
          <button type="submit" value="daftar" disabled={busy} className={secondary}>
            Daftar akun baru
          </button>
        </div>
      </form>

      <div className="mt-8 border-t border-malam-3 pt-8">
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
          Masuk sebagai tamu
        </button>
      </div>

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
      .then(({ data, error }) => (error ? setError(error.message) : setSchools(data)));
  }, []);

  return (
    <form
      className="space-y-5"
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
          .catch((e) => setError(e instanceof Error ? e.message : String(e)))
          .finally(() => setBusy(false));
      }}
    >
      <h1 className="text-3xl font-extrabold">Profil kamu</h1>
      <p className="text-redup">Nama dan warna avatar terlihat oleh teman satu ruang latihan.</p>

      <label className="block text-sm font-medium" htmlFor="display_name">
        Nama tampilan
        <input id="display_name" name="display_name" required minLength={2} maxLength={40} className={input} />
      </label>

      <fieldset>
        <legend className="text-sm font-medium">Warna avatar</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c, i) => (
            <label key={c} className="relative">
              <input type="radio" name="avatar" value={i} defaultChecked={i === 0} className="peer sr-only" />
              <span className="sr-only">Warna {i + 1}</span>
              <span
                aria-hidden="true"
                style={{ background: c }}
                className="block size-11 rounded-full border-2 border-transparent peer-checked:border-pasir peer-focus-visible:outline-2 peer-focus-visible:outline-fajar"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-medium" htmlFor="school_id">
        Sekolah
        <select id="school_id" name="school_id" required className={input} disabled={!schools}>
          {!schools && <option value="">{error ? "Gagal memuat sekolah" : "Memuat daftar sekolah…"}</option>}
          {schools?.length === 0 && <option value="">Belum ada sekolah. Jalankan supabase/schema.sql.</option>}
          {schools?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.region}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium" htmlFor="role">
        Peran
        <select id="role" name="role" className={input} defaultValue="siswa">
          {Object.entries(ROLE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={busy || !schools?.length} className={primary}>
        Simpan profil
      </button>
      {error && (
        <p role="alert" className="text-bahaya">
          {error}
        </p>
      )}
    </form>
  );
}

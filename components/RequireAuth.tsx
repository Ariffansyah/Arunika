"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, type Profile, type School } from "@/lib/supabase";

export type Me = { profile: Profile; school: School | null };

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-16">
      <p className={tone === "error" ? "text-bahaya" : "text-redup"}>{children}</p>
    </div>
  );
}

export default function RequireAuth({ children, loading }: { children: (me: Me) => React.ReactNode; loading?: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const toLogin = () => router.replace(`/masuk?next=${encodeURIComponent(pathname)}`);
    (async () => {
      const sb = supabase();
      const { data } = await sb.auth.getSession();
      if (!data.session) return toLogin();
      const { data: profile, error } = await sb.from("profiles").select("*").eq("id", data.session.user.id).maybeSingle();
      if (error) throw error;
      if (!profile) return toLogin();
      const { data: school } = profile.school_id
        ? await sb.from("schools").select("*").eq("id", profile.school_id).maybeSingle()
        : { data: null };
      setMe({ profile, school });
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [router, pathname]);

  if (error) return <Notice tone="error">Gagal memuat akun: {error}</Notice>;
  if (!me) return loading ?? <Notice>Memuat akun…</Notice>;
  return children(me);
}

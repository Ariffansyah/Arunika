import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Role = "siswa" | "guru" | "kepala_sekolah" | "pemda";
export type Profile = { id: string; display_name: string; avatar: number; school_id: string | null; role: Role };

export type School = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  hazards: string[];
  coast_km: number;
  rain_30d_mm: number;
  soil: "keras" | "sedang" | "lunak";
  material: "beton_bertulang" | "bata_tanpa_tulangan" | "kayu" | "baja_ringan";
  floors: number;
  built_year: number;
  is_demo: boolean;
};

export const ROLE_LABEL: Record<Role, string> = {
  siswa: "Siswa",
  guru: "Guru",
  kepala_sekolah: "Kepala sekolah",
  pemda: "Pemerintah daerah",
};

export const AVATAR_COLORS = ["#ff8a3d", "#3fb6a8", "#f2c14e", "#e86a92", "#7aa7ff", "#9bd16a"];

let client: SupabaseClient | null = null;

// Created lazily so prerendering works without env vars; only called from effects and handlers.
export function supabase() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}

export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

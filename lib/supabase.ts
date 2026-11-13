import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Look } from "@/components/Character";

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

// Profile `avatar` (0-5) picks one of these characters; see components/Character.tsx.
export const AVATARS: { look: Look; wheelchair: boolean }[] = [
  { look: "female-c", wheelchair: false },
  { look: "male-a", wheelchair: false },
  { look: "female-b", wheelchair: false },
  { look: "male-f", wheelchair: false },
  { look: "female-f", wheelchair: false },
  { look: "female-e", wheelchair: true },
];
export const avatarOf = (i: number) => AVATARS[i] ?? AVATARS[0];

let client: SupabaseClient | null = null;

// Created lazily so prerendering works without env vars; only called from effects and handlers.
export function supabase() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  return client;
}

export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

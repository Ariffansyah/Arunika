-- Arunika schema. Run once in the Supabase SQL editor.
-- Also enable Authentication > Sign In / Providers > "Allow anonymous sign-ins".

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null,
  lat double precision not null,
  lon double precision not null,
  hazards text[] not null default '{}',
  coast_km double precision not null,
  rain_30d_mm double precision not null,
  soil text not null check (soil in ('keras', 'sedang', 'lunak')),
  material text not null check (material in ('beton_bertulang', 'bata_tanpa_tulangan', 'kayu', 'baja_ringan')),
  floors int not null default 1,
  built_year int not null,
  is_demo boolean not null default true
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  avatar int not null default 0 check (avatar between 0 and 6),
  school_id uuid references public.schools (id),
  role text not null default 'siswa' check (role in ('siswa', 'guru', 'kepala_sekolah', 'pemda'))
);

create table if not exists public.drill_results (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  school_id uuid references public.schools (id),
  room text not null,
  scenario text not null check (scenario in ('gempa', 'banjir', 'angin', 'longsor')),
  intensity double precision not null,
  score int not null check (score between 0 and 1200),
  time_s double precision not null,
  reached boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  school_id uuid references public.schools (id),
  hazard text not null,
  score int not null check (score between 0 and 100),
  level text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- Databases created before the whirlwind and landslide drills still carry the old two-scenario check.
-- A seventh character (siswa-c) joined the picker on 2026-11-18.
alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (avatar between 0 and 6);

alter table public.drill_results drop constraint if exists drill_results_scenario_check;
alter table public.drill_results add constraint drill_results_scenario_check check (scenario in ('gempa', 'banjir', 'angin', 'longsor'));

-- Each campus map has its own leaderboard; results from before maps existed were all on the coastal campus.
alter table public.drill_results add column if not exists map text not null default 'pesisir';
alter table public.drill_results drop constraint if exists drill_results_map_check;
alter table public.drill_results add constraint drill_results_map_check check (map in ('pesisir', 'pegunungan', 'kota'));

drop index if exists drill_results_room_idx;
create index if not exists drill_results_room_map_idx on public.drill_results (room, map, scenario, score desc);
create index if not exists assessments_school_idx on public.assessments (school_id, created_at desc);

-- Aggregates only: no names or user ids leave this view.
create or replace view public.school_readiness with (security_invoker = true) as
select
  s.*,
  d.drills,
  d.participants,
  d.avg_score,
  a.structural_score,
  -- Mean of the drill component (score / 10) and the structural score; either alone if the other is missing.
  round((coalesce(least(d.avg_score / 10, 100), a.structural_score) + coalesce(a.structural_score, least(d.avg_score / 10, 100))) / 2.0) as readiness
from public.schools s
left join lateral (
  select count(*) as drills, count(distinct coalesce(r.user_id::text, r.id::text)) as participants, round(avg(r.score)) as avg_score
  from public.drill_results r
  where r.school_id = s.id
  having count(*) > 0
) d on true
left join lateral (
  select x.score as structural_score
  from public.assessments x
  where x.school_id = s.id
  order by x.created_at desc
  limit 1
) a on true;

-- Per-user request counter for the AI routes (fixed windows). Only the server calls it, with the service role.
create table if not exists public.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (user_id, bucket, window_start)
);

-- Counts one hit and returns true while the caller is still within p_limit for the current window.
create or replace function public.hit_rate_limit(p_user uuid, p_bucket text, p_limit int, p_window_s int)
returns boolean
language sql
security definer
set search_path = public
as $$
  delete from rate_limits where user_id = p_user and bucket = p_bucket and window_start < now() - interval '1 day';
  insert into rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user, p_bucket, to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s), 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning hits <= p_limit;
$$;

revoke all on function public.hit_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(uuid, text, int, int) to service_role;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.drill_results enable row level security;
alter table public.assessments enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists "schools readable" on public.schools;
create policy "schools readable" on public.schools for select to authenticated using (true);

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "results readable" on public.drill_results;
create policy "results readable" on public.drill_results for select to authenticated using (true);
drop policy if exists "own results insert" on public.drill_results;
create policy "own results insert" on public.drill_results for insert to authenticated with check (
  user_id = auth.uid()
  and school_id is not distinct from (select p.school_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists "assessments readable" on public.assessments;
create policy "assessments readable" on public.assessments for select to authenticated using (true);
-- No client insert policy: /api/analyze writes assessments with the service role, from the parsed AI result,
-- so a browser can't post its own score or pick another school.
drop policy if exists "own assessments insert" on public.assessments;

grant select on public.school_readiness to authenticated;

-- Demo data. School names are fictional; regions are real disaster-prone areas.
insert into public.schools (name, region, lat, lon, hazards, coast_km, rain_30d_mm, soil, material, floors, built_year)
select * from (values
  ('SD Pesisir Fajar (demo)', 'Padang, Sumatera Barat', -0.95, 100.35, array['gempa', 'tsunami', 'banjir'], 0.6, 380, 'lunak', 'bata_tanpa_tulangan', 2, 1992),
  ('SMP Teluk Harapan (demo)', 'Palu, Sulawesi Tengah', -0.89, 119.86, array['gempa', 'tsunami', 'likuefaksi'], 1.2, 120, 'lunak', 'beton_bertulang', 2, 2019),
  ('SD Ujung Pantai (demo)', 'Banda Aceh, Aceh', 5.56, 95.32, array['gempa', 'tsunami'], 2.0, 210, 'sedang', 'beton_bertulang', 2, 2007),
  ('SMA Selat Sunda (demo)', 'Pandeglang, Banten', -6.31, 105.83, array['tsunami', 'banjir'], 0.4, 260, 'sedang', 'bata_tanpa_tulangan', 1, 1988),
  ('SD Muara Segara (demo)', 'Cilacap, Jawa Tengah', -7.72, 109.01, array['banjir', 'tsunami'], 0.9, 330, 'lunak', 'kayu', 1, 1981),
  ('SMP Rinjani Timur (demo)', 'Lombok Utara, NTB', -8.35, 116.15, array['gempa', 'longsor'], 3.5, 90, 'keras', 'bata_tanpa_tulangan', 1, 1996),
  ('SD Rob Utara (demo)', 'Jakarta Utara, DKI Jakarta', -6.12, 106.86, array['banjir'], 0.8, 310, 'lunak', 'beton_bertulang', 3, 2011),
  ('SMP Pantura Lestari (demo)', 'Semarang Utara, Jawa Tengah', -6.95, 110.42, array['banjir'], 1.1, 290, 'lunak', 'baja_ringan', 2, 2004),
  ('SD Lereng Merapi (demo)', 'Sleman, DI Yogyakarta', -7.62, 110.43, array['gempa', 'erupsi'], 40, 240, 'sedang', 'beton_bertulang', 1, 2009),
  ('SMA Bengkulu Bahari (demo)', 'Bengkulu, Bengkulu', -3.80, 102.27, array['gempa', 'tsunami'], 0.7, 280, 'sedang', 'beton_bertulang', 2, 1999)
) v(name, region, lat, lon, hazards, coast_km, rain_30d_mm, soil, material, floors, built_year)
where not exists (select 1 from public.schools);

-- Synthetic demo drills and assessments so the dashboard is not empty (user_id null marks them as seed data).
insert into public.drill_results (user_id, school_id, room, scenario, intensity, score, time_s, reached)
select null, s.id, s.id::text, sc, case sc when 'gempa' then 6.5 else 1.0 end,
  greatest(0, least(1200, round(500 + random() * 600)))::int, round((20 + random() * 30)::numeric, 1), true
from public.schools s
cross join generate_series(1, 6) n
cross join lateral (select case when n % 2 = 0 then 'gempa' else 'banjir' end as sc) x
where s.is_demo and s.name not like 'SMA Selat%' and not exists (select 1 from public.drill_results where user_id is null);

insert into public.assessments (user_id, school_id, hazard, score, level, result)
select null, s.id, 'umum', v.score, v.level, jsonb_build_object(
  'is_building', true, 'score', v.score, 'level', v.level,
  'summary', 'Data contoh (demo), bukan hasil asesmen nyata.',
  'observations', jsonb_build_array(),
  'recommendations', jsonb_build_array(jsonb_build_object('action', v.rec, 'priority', 'segera', 'cost_band', 'sedang'))
)
from public.schools s
join (values
  ('Padang', 38, 'tinggi', 'Tambahkan kolom praktis dan balok ring pada dinding bata kelas'),
  ('Palu', 72, 'sedang', 'Periksa sambungan kolom-balok pasca gempa secara berkala'),
  ('Cilacap', 31, 'sangat_tinggi', 'Tinggikan lantai perpustakaan kayu di atas muka banjir'),
  ('Lombok', 45, 'tinggi', 'Ganti atap genteng berat dengan penutup ringan'),
  ('Jakarta', 66, 'sedang', 'Pindahkan panel listrik ke lantai 2')
) v(region_key, score, level, rec) on s.region like v.region_key || '%'
where not exists (select 1 from public.assessments where user_id is null);

# 🌅 ARUNIKA
### Platform Simulasi & Evaluasi Kesiapsiagaan Bencana Sekolah Indonesia

[![Next.js](https://img.shields.io/badge/Next.js-16.4-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3-blue?logo=react)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-R3F-orange?logo=three.js)](https://threejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4.3-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Realtime%20%26%20Postgres-3ecf8e?logo=supabase)](https://supabase.com/)
[![Groq AI](https://img.shields.io/badge/AI-Groq%20gpt--oss%20%26%20Qwen3-f55036)](https://groq.com/)

**Arunika** adalah platform berbasis web interaktif 3D dan kecerdasan buatan (*AI*) yang dirancang untuk melatih, mengevaluasi, dan memperkuat kesiapsiagaan warga sekolah di wilayah rawan bencana Indonesia sesuai standar dan pedoman Badan Nasional Penanggulangan Bencana (BNPB).

---

## 🌟 Pilar & Fitur Utama

### 1. Simulasi Kampus 3D Interaktif (`/kampus`)
* **3 Ragam Topografi Indonesia:** Kampus Pesisir (ancaman rob & bukit evakuasi), Pegunungan (lereng rawan longsor), dan Kawasan Perkotaan (kawasan padat gedung bertingkat).
* **4 Skenario Bencana Utama:** Gempa Bumi (*Drop, Cover, Hold on*), Banjir/Rob (air meninggi, arus, bahaya listrik), Angin Puting Beliung, dan Tanah Longsor.
* **Multiplayer Real-time (Supabase Channels & Presence):** Siswa dan guru dapat masuk ke dalam ruang simulasi yang sama, melihat pergerakan avatar teman, membunyikan kentongan/alarm bersama, dan melakukan evakuasi serentak.
* **Visual Debriefing Trail:** Menampilkan visualisasi peta jejak langkah aktual siswa dibandingkan dengan rute evakuasi ideal, lengkap dengan perhitungan efisiensi rute dan catatan evaluasi.
* **Petugas Keselamatan Virtual (AI Warden):** Asisten AI interaktif dengan respon *streaming* untuk menjawab pertanyaan evakuasi, isi tas siaga, dan P3K.

### 2. Gladi Ruang AI untuk Tim Siaga Sekolah (`/gladi`)
Gladi ruang (*tabletop exercise*) adalah latihan BNPB untuk tim siaga: bencana dibahas langkah demi langkah di atas meja. Siswa berlatih di kampus 3D; guru dan kepala sekolah berlatih di sini.
* **Skenario dari gempa sungguhan:** gempa terkini diambil langsung dari umpan publik **BMKG** (`autogempa.json`). Jarak episentrum ke sekolah dihitung (haversine); bila jauh, gempa yang sama "dipindahkan" ke dekat sekolah untuk latihan. Bisa juga memilih banjir, longsor, atau angin puting beliung.
* **AI sebagai pengendali latihan:** memberi 4 situasi berurutan yang disesuaikan dengan profil sekolah (jumlah lantai, material, jarak ke pantai, jenis tanah). Peserta memilih salah satu dari 3 tindakan atau menulis keputusannya sendiri.
* **Penilaian berbasis pedoman:** setiap keputusan dinilai *tepat*, *kurang*, atau *berbahaya* dengan acuan langkah sekolah aman bencana yang sama dengan yang diajarkan simulasi 3D, dan situasi berikutnya adalah akibat dari keputusan itu.
* **Rencana tindak lanjut:** di akhir, AI menyusun catatan dan perbaikan rencana siaga (prioritas + kelas biaya) yang tersimpan ke dasbor sebagai skor kesiapan tim siaga. Skor dihitung dari putusan tiap langkah, bukan angka bebas dari model.
* **Aman dari manipulasi:** setiap langkah ditandatangani HMAC di server, sehingga peramban tidak bisa mengubah situasi atau putusan AI sebelum skor disimpan. Jawaban peserta diperlakukan sebagai data, bukan instruksi, untuk menahan *prompt injection*.

### 3. Dasbor Kesiapsiagaan Multi-Peran (`/dashboard`)
* **🎓 Siswa:** Rapor mandiri kelulusan 4 skenario BNPB, lencana prestasi, dan cetak kartu bukti prestasi siswa siaga.
* **🧑‍🏫 Guru:** Generator tautan/kode sesi kelas multiplayer, monitoring nilai dan kepatuhan evakuasi kelas, serta ekspor rekap nilai (CSV).
* **🏛️ Kepala Sekolah:** Indeks Kesiapan Gabungan (kesiapan siswa dari latihan kampus + kesiapan tim siaga dari gladi ruang), rencana tindak lanjut untuk RKAS, serta cetak laporan sekolah.
* **🏢 Pemda / BPBD:** Peta 3D geospasial Indonesia, filter prioritas intervensi wilayah, dan ekspor data analisis risiko sekolah se-daerah.

---

## 🛠️ Tumpukan Teknologi (*Tech Stack*)

* **Framework:** Next.js 16 (App Router, Turbopack, React 19)
* **3D Visuals & Engine:** Three.js, `@react-three/fiber`, `@react-three/drei`
* **Styling & Icons:** Tailwind CSS v4, Lucide React
* **Backend & Database:** Supabase (PostgreSQL, Row Level Security, Realtime Broadcast & Presence)
* **AI & LLM Services:** Groq SDK: `openai/gpt-oss-120b` dengan *strict structured output* untuk gladi ruang, `qwen/qwen3.8-27b` untuk Petugas AI (*streaming chat*)
* **Data publik:** BMKG `autogempa.json` (gempa terkini), di-*cache* 1 menit dengan `"use cache"` Next.js
* **Test Suite:** Native Node.js Test Runner dengan cross-platform suite runner

---

## 🚀 Memulai Pengembangan Lokal

### Prasyarat
* [Node.js](https://nodejs.org/) v20+ atau v22+
* [pnpm](https://pnpm.io/) v10+ (disarankan) atau npm

### 1. Kloning & Instal Dependensi
```bash
git clone https://github.com/username/arunika.git
cd arunika
pnpm install
```

### 2. Konfigurasi Environment Variable
Salin berkas `.env.example` menjadi `.env.local` dan isi kredensial Supabase serta Groq:
```bash
cp .env.example .env.local
```
Variabel yang dibutuhkan:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GROQ_API_KEY=gsk_your_groq_api_key
```

### 3. Setup Database
Jalankan skrip SQL di berkas `supabase/schema.sql` pada SQL Editor Supabase Anda untuk membuat tabel, fungsi *rate limit*, dan data demo awal.

### 4. Jalankan Server Pengembangan
```bash
pnpm dev
```
Buka [http://localhost:3000](http://localhost:3000) pada peramban Anda.

---

## 🧪 Pengujian & Kualitas Kode

Platform Arunika dilengkapi dengan suite pengujian otomatis yang menguji logika denah gedung (*floorplan*), *pathfinding/navigation*, fisika rintangan, dan skenario bencana lintas seluruh varian peta kampus:

```bash
# Menjalankan seluruh pengujian unit di semua konfigurasi peta
pnpm test

# Menjalankan pengujian untuk peta tertentu saja
node scripts/test.mjs pesisir
node scripts/test.mjs pegunungan
node scripts/test.mjs kota

# Pengecekan linter kode
pnpm lint
```

---

## 📂 Struktur Direktori

```text
arunika/
├── app/                  # Next.js App Router (Halaman & Endpoint API)
│   ├── gladi/            # Gladi ruang AI untuk tim siaga sekolah
│   ├── api/              # Route handlers (/api/gladi, /api/warden)
│   ├── dashboard/        # Dasbor analitik multi-peran & peta 3D Indonesia
│   ├── kampus/           # Halaman simulasi kampus 3D interaktif
│   └── masuk/            # Alur autentikasi & kelengkapan profil pengguna
├── components/           # Komponen React UI
│   ├── campus/           # Engine 3D (World, Player, Hud, Controls, DebriefingTrail)
│   ├── dashboard/        # Komponen tampilan peran (Siswa, Guru, KS, Pemda) & Peta
│   └── landing/          # Komponen tampilan beranda (Hero, Scene preview)
├── lib/                  # Logika inti murni (pathfinding, sim, floorplan, assessments)
├── public/               # Aset statis (tekstur, audio, karakter sprite)
├── scripts/              # Skrip runner utilitas & pengujian lintas platform
└── supabase/             # Skema basis data PostgreSQL & data benih (seed)
```

---

## 📄 Lisensi
Hak Cipta © 2026 Tim Pengembang Arunika. Dikembangkan untuk kompetisi inovasi digital dan ketahanan bencana Indonesia.

import type { Scenario } from "./sim.ts";

export type Step = { title: string; why: string };
export type Question = { q: string; options: string[]; answer: number; why: string };
export type Lesson = { steps: Step[]; quiz: Question[] };

// What to do, in order, and why: the same actions the drill scores, after BNPB's school guidance.
export const LESSONS: Record<Scenario["kind"], Lesson> = {
  gempa: {
    steps: [
      { title: "Merunduk, berlindung, bertahan.", why: "Masuk ke bawah meja, lindungi kepala dan leher, pegang kaki meja sampai guncangan berhenti." },
      { title: "Jauhi jendela, lemari, dan rak.", why: "Kaca pecah dan perabot tinggi yang roboh paling sering melukai orang di dalam kelas." },
      { title: "Tetap di tempat selama guncangan.", why: "Kebanyakan cedera terjadi saat orang berpindah ketika lantai masih bergerak." },
      { title: "Keluar tertib setelah guncangan berhenti.", why: "Berjalan, jangan berlari, ikuti jalur evakuasi, dan jangan kembali ke dalam gedung." },
      { title: "Di luar, jauhi gedung, pohon, dan tiang listrik.", why: "Bila ada gempa susulan, merunduk di tempat terbuka dan lindungi kepala." },
      { title: "Lapor ke petugas di titik kumpul.", why: "Petugas menghitung siapa yang sudah selamat dan siapa yang masih dicari." },
    ],
    quiz: [
      {
        q: "Gempa terjadi saat kamu di kelas. Apa yang pertama kamu lakukan?",
        options: ["Lari keluar kelas", "Berlindung di bawah meja dan lindungi kepala", "Berdiri di dekat jendela"],
        answer: 1,
        why: "Selama lantai berguncang, meja melindungi dari benda jatuh; berlari justru membuat jatuh.",
      },
      {
        q: "Guncangan sudah berhenti. Bagaimana cara keluar gedung?",
        options: ["Berjalan tertib lewat jalur evakuasi", "Berlari secepatnya", "Menunggu di dalam sampai dijemput"],
        answer: 0,
        why: "Berlari di lorong membuat orang jatuh dan berdesakan di pintu.",
      },
      {
        q: "Kamu di lapangan saat gempa. Di mana tempat paling aman?",
        options: ["Di bawah pohon besar", "Di samping dinding gedung", "Di tempat terbuka, jauh dari gedung dan pohon"],
        answer: 2,
        why: "Di luar, bahaya terbesar adalah dinding, dahan, dan tiang yang roboh.",
      },
    ],
  },
  banjir: {
    steps: [
      { title: "Matikan listrik di panel.", why: "Listrik yang masih menyala di genangan bisa menyengat siapa pun yang menyentuh air." },
      { title: "Bunyikan kentongan.", why: "Bunyi cepat tanpa henti memberi tahu kelas lain dan warga untuk mengungsi." },
      { title: "Jangan melewati air setinggi lutut.", why: "Air berarus setinggi lutut bisa menjatuhkan orang dan menyembunyikan lubang atau selokan." },
      { title: "Naik ke tempat tinggi.", why: "Bukit atau lantai atas gedung yang kokoh, lewat jalan yang paling tinggi." },
      { title: "Lapor dan tunggu sampai air surut.", why: "Jangan kembali mengambil barang; air bisa naik lagi dengan cepat." },
    ],
    quiz: [
      {
        q: "Air mulai masuk ke sekolah. Apa yang dilakukan lebih dulu?",
        options: ["Mematikan listrik di panel", "Menyelamatkan buku di rak bawah", "Bermain air di halaman"],
        answer: 0,
        why: "Genangan yang teraliri listrik berbahaya bagi semua orang di dalamnya.",
      },
      {
        q: "Jalan menuju tempat tinggi tergenang setinggi lutut. Apa yang tepat?",
        options: ["Terobos saja agar cepat", "Cari jalan lain yang lebih tinggi", "Berenang melintasinya"],
        answer: 1,
        why: "Arus setinggi lutut sudah cukup kuat untuk menjatuhkan orang.",
      },
      {
        q: "Di mana tempat berlindung saat banjir?",
        options: ["Lantai dasar yang paling dekat", "Bukit atau lantai atas gedung yang kokoh", "Di bawah jembatan"],
        answer: 1,
        why: "Semakin tinggi tempatnya, semakin lama air butuh waktu untuk mencapainya.",
      },
    ],
  },
  angin: {
    steps: [
      { title: "Masuk ke ruang kokoh tanpa jendela.", why: "Toilet, tangga, atau ruang tata usaha di gedung beton, sebelum angin tiba." },
      { title: "Jauhi jendela dan kaca.", why: "Kaca pecah dan benda yang terbawa angin melukai orang di dekatnya." },
      { title: "Merunduk dan lindungi kepala.", why: "Duduk rendah di dekat dinding dalam, tangan menutup kepala dan leher." },
      { title: "Jangan di luar, di bawah pohon, atau di kantin.", why: "Atap baja ringan dan dahan pohon paling dulu terbang saat angin kencang." },
      { title: "Tunggu sampai reda, lalu lapor ke guru.", why: "Angin bisa kembali; keluar setelah guru memberi tanda aman." },
    ],
    quiz: [
      {
        q: "Angin puting beliung terlihat mendekat. Ke mana kamu pergi?",
        options: ["Ke lapangan untuk melihat", "Ke ruang kokoh tanpa jendela", "Ke kantin beratap ringan"],
        answer: 1,
        why: "Dinding tebal tanpa kaca menahan angin dan benda yang terbawa.",
      },
      {
        q: "Di dalam ruang aman, apa yang kamu lakukan?",
        options: ["Mengintip dari jendela", "Merunduk dan melindungi kepala", "Membuka pintu agar angin lewat"],
        answer: 1,
        why: "Posisi rendah dengan kepala terlindung mengurangi cedera dari benda yang jatuh.",
      },
      {
        q: "Suara angin mulai mengecil. Kapan boleh keluar?",
        options: ["Langsung saat itu juga", "Setelah benar-benar reda dan guru memberi tanda", "Saat masih hujan deras"],
        answer: 1,
        why: "Angin bisa berbalik arah; tunggu tanda aman dari guru.",
      },
    ],
  },
  longsor: {
    steps: [
      { title: "Kenali tanda longsor.", why: "Retakan baru di tanah, pohon atau tiang yang miring, air keruh atau mata air baru di lereng." },
      { title: "Periksa dari jauh.", why: "Jangan naik ke lereng untuk melihat lebih dekat; lihat dari tepi, lalu menjauh." },
      { title: "Bunyikan kentongan.", why: "Tanda bahaya membuat semua orang di sekitar lereng ikut menjauh." },
      { title: "Menjauh dari lereng sebelum longsor.", why: "Pergi ke tempat terbuka yang jauh dari jalur longsoran, bukan ke bukit." },
      { title: "Lapor di titik kumpul aman.", why: "Petugas memastikan tidak ada yang tertinggal di dekat lereng." },
    ],
    quiz: [
      {
        q: "Mana yang termasuk tanda longsor?",
        options: ["Retakan baru di tanah lereng", "Langit cerah", "Daun yang gugur"],
        answer: 0,
        why: "Retakan berarti tanah di lereng mulai bergerak.",
      },
      {
        q: "Kamu melihat tanda longsor. Apa yang dilakukan?",
        options: ["Naik ke lereng untuk memeriksa", "Membunyikan kentongan lalu menjauh", "Menunggu di gedung di kaki bukit"],
        answer: 1,
        why: "Waktu antara tanda pertama dan longsor bisa sangat singkat.",
      },
      {
        q: "Ke mana menyelamatkan diri saat longsor?",
        options: ["Ke puncak bukit", "Ke tempat terbuka yang jauh dari lereng", "Ke dalam gedung di kaki lereng"],
        answer: 1,
        why: "Longsoran mengalir turun dan menimbun apa pun di jalurnya.",
      },
    ],
  },
};

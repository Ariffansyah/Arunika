import { ASSESSMENT_SCHEMA, HAZARDS, parseAssessment, type Assessment } from "@/lib/assessment";
import { VISION_MODEL, adminDb, groq, requestUser, text } from "@/lib/server";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

const HAZARD_FOCUS: Record<(typeof HAZARDS)[number], string> = {
  gempa: "ketahanan terhadap gempa (retak, kolom dan balok, sambungan, dinding bata tanpa tulangan, atap berat)",
  banjir: "ketahanan terhadap banjir dan banjir rob (tinggi lantai, rembesan, korosi, instalasi listrik rendah)",
  umum: "ketahanan bencana secara umum",
};

const prompt = (hazard: (typeof HAZARDS)[number]) => `Kamu membantu pengelola sekolah di Indonesia menilai bangunan dari sebuah foto.
Fokus: ${HAZARD_FOCUS[hazard]}.

Isi JSON sesuai skema:
- is_building: false jika foto tidak memperlihatkan bangunan atau bagian bangunan; isi field lain seadanya.
- score: skor ketahanan 0-100 (tinggi berarti lebih tahan).
- level: tingkat kerentanan (rendah, sedang, tinggi, sangat_tinggi), searah dengan kebalikan skor.
- summary: 1-2 kalimat ringkasan.
- observations: hal yang benar-benar terlihat di foto, jangan menebak yang tidak terlihat.
- recommendations: langkah perbaikan konkret untuk pengelola sekolah, dengan prioritas dan kelas biaya.
Gunakan Bahasa Indonesia. Ini penilaian awal dari satu foto, bukan pengganti pemeriksaan ahli struktur.`;

export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return text("Masuk terlebih dahulu.", 401);
  // Reject oversized uploads before buffering the whole body.
  if (Number(req.headers.get("content-length")) > MAX_BYTES + 64 * 1024) return text("Ukuran foto maksimal 5 MB.", 413);
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  const hazard = HAZARDS.find((h) => h === form?.get("hazard")) ?? "umum";
  if (!(file instanceof File)) return text("Foto tidak ditemukan.", 400);
  if (!TYPES.includes(file.type)) return text("Format foto harus JPG, PNG, atau WebP.", 400);
  if (file.size > MAX_BYTES) return text("Ukuran foto maksimal 5 MB.", 400);

  try {
    const image = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    const res = await groq().chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt(hazard) },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "assessment", strict: false, schema: ASSESSMENT_SCHEMA },
      },
      reasoning_format: "hidden",
      temperature: 0.2,
    });
    const assessment = parseAssessment(JSON.parse(res.choices[0]?.message?.content ?? "null"));
    if (!assessment) return text("AI mengembalikan hasil yang tidak lengkap. Coba lagi.", 502);
    return Response.json({ assessment, saved: assessment.is_building && (await save(user.id, hazard, assessment)) });
  } catch (e) {
    console.error("analyze", e);
    return text("Layanan AI sedang tidak tersedia.", 502);
  }
}

// The school comes from the caller's profile, never from the request.
async function save(userId: string, hazard: string, a: Assessment) {
  try {
    const sb = adminDb();
    const { data: profile } = await sb.from("profiles").select("school_id").eq("id", userId).maybeSingle();
    const { error } = await sb.from("assessments").insert({
      user_id: userId,
      school_id: profile?.school_id ?? null,
      hazard,
      score: a.score,
      level: a.level,
      result: a,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("analyze save", e);
    return false;
  }
}

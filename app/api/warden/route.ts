import { CHAT_MODEL, groq, rateLimit, requestUser, text } from "@/lib/server";

const SYSTEM = `Kamu adalah Petugas Keselamatan virtual di sebuah sekolah di daerah rawan bencana di Indonesia.
Lawan bicaramu biasanya siswa SD sampai SMA, kadang guru atau kepala sekolah.

Topik yang kamu layani: evakuasi saat gempa, banjir, banjir rob, tsunami, longsor, dan angin puting beliung; isi tas siaga bencana;
pertolongan pertama untuk luka ringan; cara mengenali dan memperkuat bagian bangunan sekolah yang rentan.

Aturan:
- Jawab dalam Bahasa Indonesia yang ramah dan mudah dipahami, paling banyak 6 kalimat atau 6 butir.
- Untuk gempa, ajarkan "merunduk, lindungi kepala, bertahan" lalu evakuasi setelah guncangan berhenti.
- Jika ada keadaan darurat nyata, cedera serius, atau orang dalam bahaya, minta mereka segera menghubungi 112 dan guru terdekat.
- Untuk penilaian struktur bangunan, jelaskan tanda-tanda umum, lalu sarankan pemeriksaan oleh ahli struktur atau dinas terkait.
- Jangan mengarang nomor peraturan, statistik, atau nama lembaga yang tidak kamu yakini.
- Jika pertanyaan di luar topik keselamatan dan kebencanaan, arahkan kembali dengan sopan.`;

type Msg = { role: "user" | "model"; text: string };

function parse(body: unknown): Msg[] | null {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || list.length < 1 || list.length > 20) return null;
  const ok = list.every(
    (m) =>
      (m?.role === "user" || m?.role === "model") &&
      typeof m.text === "string" &&
      m.text.trim().length > 0 &&
      m.text.length <= 2000,
  );
  return ok && list.at(-1).role === "user" ? (list as Msg[]) : null;
}

export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return text("Masuk terlebih dahulu.", 401);
  const messages = parse(await req.json().catch(() => null));
  if (!messages) return text("Format pesan tidak valid.", 400);
  const limited = await rateLimit(user.id, "warden", 20, 10 * 60);
  if (limited) return limited;

  let stream;
  try {
    stream = await groq().chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        ...messages.map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.text })),
      ],
      temperature: 0.4,
      max_completion_tokens: 700,
      stream: true,
    });
  } catch (e) {
    console.error("warden", e);
    return text("Layanan AI sedang tidak tersedia.", 502);
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
      } catch (e) {
        console.error("warden stream", e);
        controller.enqueue(encoder.encode("\n\n(Jawaban terputus. Coba tanyakan lagi.)"));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

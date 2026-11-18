import { APIError } from "groq-sdk";
import { createHmac, timingSafeEqual } from "node:crypto";
import { str, type Assessment } from "@/lib/assessment";
import { latestQuake } from "@/lib/bmkg";
import {
  HAZARDS,
  SCHEMAS,
  STEPS,
  parseDebrief,
  parseFeedback,
  parseInject,
  phaseOf,
  stepPrompt,
  systemPrompt,
  type Inject,
  type Phase,
  type Seed,
  type State,
} from "@/lib/gladi";
import { GLADI_MODEL, adminDb, groq, rateLimit, requestUser, text } from "@/lib/server";
import type { School } from "@/lib/supabase";

// The browser carries the exercise between steps. The signature keeps it from rewriting an inject or a verdict,
// which matters because the last step saves a score for the user's school.
function sign(userId: string, state: State) {
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY!)
    .update(`gladi:${userId}:${JSON.stringify(state)}`)
    .digest("base64url");
}

function verified(userId: string, state: State, token: unknown) {
  const want = Buffer.from(sign(userId, state));
  const got = Buffer.from(typeof token === "string" ? token : "");
  return want.length === got.length && timingSafeEqual(want, got);
}

// The model tends to list the right action first.
const shuffled = (i: Inject | null) =>
  i && { ...i, options: i.options.map((o) => ({ o, k: Math.random() })).sort((a, b) => a.k - b.k).map(({ o }) => o) };

// Null when the model's reply is not usable JSON, so the caller can ask once more.
async function ask(system: string, user: string, phase: Phase) {
  try {
    const res = await groq().chat.completions.create({
      model: GLADI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name: `gladi_${phase}`, strict: true, schema: SCHEMAS[phase] } },
      reasoning_format: "hidden",
      reasoning_effort: "low",
      temperature: 0.7,
    });
    return JSON.parse(res.choices[0]?.message?.content ?? "null");
  } catch (e) {
    if (e instanceof SyntaxError || (e instanceof APIError && e.status === 400)) return null;
    throw e;
  }
}

async function schoolOf(userId: string): Promise<School | null> {
  const sb = adminDb();
  const { data: profile } = await sb.from("profiles").select("school_id").eq("id", userId).maybeSingle();
  if (!profile?.school_id) return null;
  const { data } = await sb.from("schools").select("*").eq("id", profile.school_id).maybeSingle();
  return data;
}

export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return text("Masuk terlebih dahulu.", 401);
  if (!process.env.SUPABASE_SECRET_KEY) return text("SUPABASE_SECRET_KEY belum diatur di server.", 500);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return text("Format permintaan tidak valid.", 400);

  let seed: Seed;
  let state: State | null = null;
  let answer: string | null = null;
  if (body.state) {
    state = body.state as State;
    if (!verified(user.id, state, body.token)) return text("Sesi gladi tidak valid. Mulai ulang gladi.", 400);
    if (state.done.length >= STEPS) return text("Gladi ini sudah selesai.", 400);
    answer = str(body.answer, 400);
    if (!answer) return text("Tulis atau pilih keputusan dulu.", 400);
    seed = state.seed;
  } else if (body.hazard === "bmkg") {
    const quake = await latestQuake();
    if (!quake) return text("Data gempa BMKG sedang tidak tersedia. Pilih ancaman lain.", 503);
    seed = { hazard: "gempa", quake };
  } else {
    seed = { hazard: HAZARDS.find((h) => h === body.hazard) ?? "gempa", quake: null };
  }

  const limited = await rateLimit(user.id, "gladi", 40, 60 * 60);
  if (limited) return limited;

  const done = state?.done ?? [];
  const phase = phaseOf(done.length + (answer ? 1 : 0));
  try {
    const school = await schoolOf(user.id);
    // One retry: a malformed reply mid-exercise costs the participant their place, a second call costs little.
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await ask(systemPrompt(seed, school), stepPrompt(done, state?.pending ?? null, answer), phase);

      if (phase === "start") {
        const pending = shuffled(parseInject(out?.inject));
        if (!pending) continue;
        const next: State = { seed, done: [], pending };
        return Response.json({ state: next, token: sign(user.id, next) });
      }

      const feedback = parseFeedback(out?.feedback);
      if (!feedback || !state || !answer) continue;
      const turns = [...done, { inject: state.pending, answer, feedback }];

      if (phase === "step") {
        const pending = shuffled(parseInject(out?.inject));
        if (!pending) continue;
        const next: State = { seed, done: turns, pending };
        return Response.json({ state: next, token: sign(user.id, next) });
      }

      const debrief = parseDebrief(out, turns);
      if (!debrief) continue;
      return Response.json({ done: turns, debrief, saved: await save(user.id, school, seed, debrief) });
    }
    return text("AI mengembalikan hasil yang tidak lengkap. Coba lagi.", 502);
  } catch (e) {
    console.error("gladi", e);
    return text("Layanan AI sedang tidak tersedia.", 502);
  }
}

// The school comes from the caller's profile, never from the request.
async function save(userId: string, school: School | null, seed: Seed, a: Assessment) {
  try {
    const { error } = await adminDb().from("assessments").insert({
      user_id: userId,
      school_id: school?.id ?? null,
      hazard: seed.hazard,
      score: a.score,
      level: a.level,
      result: a,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("gladi save", e);
    return false;
  }
}

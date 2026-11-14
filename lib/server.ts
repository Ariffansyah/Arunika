import "server-only";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";

// Chat needs speed and good Indonesian; the analyzer needs image input and JSON-schema output.
export const CHAT_MODEL = "qwen/qwen3.8-27b";
export const VISION_MODEL = "qwen/qwen3.8-27b";

let client: Groq | null = null;
export function groq() {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY belum diatur di server.");
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

const db = (key: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });

// Bypasses RLS: only for writes the server has validated itself.
export function adminDb() {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY belum diatur di server.");
  return db(process.env.SUPABASE_SECRET_KEY);
}

export async function requestUser(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try {
    const { data } = await db(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!).auth.getUser(token);
    return data.user;
  } catch (e) {
    console.error("auth check failed", e);
    return null;
  }
}

export const text = (body: string, status: number, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...headers } });

export async function rateLimit(userId: string, bucket: string, limit: number, windowS: number) {
  try {
    const { data, error } = await adminDb().rpc("hit_rate_limit", {
      p_user: userId,
      p_bucket: bucket,
      p_limit: limit,
      p_window_s: windowS,
    });
    if (error) throw error;
    if (data === true) return null;
    const retry = windowS - (Math.floor(Date.now() / 1000) % windowS);
    return text(`Terlalu banyak permintaan. Coba lagi dalam ${Math.ceil(retry / 60)} menit.`, 429, {
      "Retry-After": String(retry),
    });
  } catch (e) {
    // Fail closed: the limit exists to cap AI spend, so an unreachable counter must not mean unlimited calls.
    console.error("rate limit", e);
    return text("Layanan sedang sibuk. Coba lagi sebentar lagi.", 503);
  }
}

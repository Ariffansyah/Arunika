import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";

// Chat needs speed and good Indonesian. The gladi needs replies that always fit its JSON schema, which
// gpt-oss gives with strict structured output; qwen broke the schema in about one step in five.
export const CHAT_MODEL = "qwen/qwen3.8-27b";
export const GLADI_MODEL = "openai/gpt-oss-120b";

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

// A fixed-window counter in Postgres: null while the caller is within the limit, else the reply to send.
async function hit(fn: "hit_rate_limit" | "hit_ip_rate_limit", args: Record<string, unknown>, windowS: number) {
  try {
    const { data, error } = await adminDb().rpc(fn, args);
    if (error) throw error;
    if (data === true) return null;
    const retry = windowS - (Math.floor(Date.now() / 1000) % windowS);
    return text(`Terlalu banyak permintaan. Coba lagi dalam ${Math.ceil(retry / 60)} menit.`, 429, {
      "Retry-After": String(retry),
    });
  } catch (e) {
    // Fail closed: the limit exists to cap AI spend, so an unreachable counter must not mean unlimited calls.
    console.error("rate limit", fn, e);
    return text("Layanan sedang sibuk. Coba lagi sebentar lagi.", 503);
  }
}

export const rateLimit = (userId: string, bucket: string, limit: number, windowS: number) =>
  hit("hit_rate_limit", { p_user: userId, p_bucket: bucket, p_limit: limit, p_window_s: windowS }, windowS);

// The caller's address as a proxy saw it, never as the client claims it: Vercel's own header first, else the last
// x-forwarded-for entry, which the nearest proxy appended. Earlier entries are whatever the client sent.
const clientIp = (req: Request) =>
  req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";

// Guest accounts cost nothing to make, so a per-user cap alone does not cap AI spend: this one counts per address.
// A whole school can share one address, so its limits are wide. Addresses are stored only as salted hashes.
export function ipRateLimit(req: Request, bucket: string, limit: number, windowS: number) {
  const ip = createHash("sha256").update(`${process.env.SUPABASE_SECRET_KEY}:${clientIp(req)}`).digest("hex");
  return hit("hit_ip_rate_limit", { p_ip: ip, p_bucket: bucket, p_limit: limit, p_window_s: windowS }, windowS);
}

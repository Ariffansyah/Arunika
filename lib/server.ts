import "server-only";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";

// Chat needs speed and good Indonesian; the analyzer needs image input and JSON-schema output.
export const CHAT_MODEL = "llama-3.3-70b-versatile";
export const VISION_MODEL = "qwen/qwen3.8-27b";

let client: Groq | null = null;
export function groq() {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY belum diatur di server.");
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

const db = (key: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });

/** Bypasses RLS: only for writes the server has validated itself. */
export function adminDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diatur di server.");
  return db(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** The Supabase user behind `Authorization: Bearer <access token>`, or null. */
export async function requestUser(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try {
    const { data } = await db(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!).auth.getUser(token);
    return data.user;
  } catch (e) {
    console.error("auth check failed", e);
    return null;
  }
}

export const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

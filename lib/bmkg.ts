import { cacheLife } from "next/cache";
import { parseQuake } from "./gladi.ts";

// BMKG's public feed of the latest felt earthquake; it changes a few times a day.
export async function latestQuake() {
  "use cache";
  cacheLife("minutes");
  try {
    const res = await fetch("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json", { signal: AbortSignal.timeout(5000) });
    return res.ok ? parseQuake(await res.json()) : null;
  } catch (e) {
    console.error("bmkg", e);
    return null;
  }
}

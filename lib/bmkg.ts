import { cacheLife } from "next/cache";
import { parseCap, parseNowcast, parseQuakeLists, type Warning } from "./bmkgFeed.ts";
import { parseQuake } from "./gladi.ts";

const TEWS = "https://data.bmkg.go.id/DataMKG/TEWS";
const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r : Promise.reject(new Error(`${r.status} ${url}`))));

// BMKG's public feed of the latest felt earthquake; it changes a few times a day.
export async function latestQuake() {
  "use cache";
  cacheLife("minutes");
  try {
    return parseQuake(await (await get(`${TEWS}/autogempa.json`)).json());
  } catch (e) {
    console.error("bmkg", e);
    return null;
  }
}

// The last fifteen M5+ quakes and the last fifteen felt ones. Either list may fail on its own.
export async function recentQuakes() {
  "use cache";
  cacheLife("minutes");
  const [strong, felt] = await Promise.all(
    ["gempaterkini", "gempadirasakan"].map((f) =>
      get(`${TEWS}/${f}.json`)
        .then((r) => r.json())
        .catch((e) => console.error("bmkg", e)),
    ),
  );
  return parseQuakeLists(strong, felt);
}

// BMKG's severe weather nowcasts. The RSS feed lists the alerts; each alert's CAP document holds its polygons, so one
// refresh is about twenty requests, made every ten minutes at most. Alerts last two or three hours.
export async function weatherWarnings(): Promise<Warning[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  try {
    const links = parseNowcast(await (await get("https://www.bmkg.go.id/alerts/nowcast/id/rss.xml")).text());
    const caps = await Promise.allSettled(links.map(async (l) => parseCap(await (await get(l)).text())));
    return caps.flatMap((c) => (c.status === "fulfilled" && c.value ? [c.value] : []));
  } catch (e) {
    console.error("bmkg", e);
    return [];
  }
}

import { parseQuake, type Hazard, type Quake } from "./gladi.ts";

// Parsers for BMKG's public feeds, kept free of fetching so they can be tested. Everything here is untrusted input:
// numbers are range-checked and lists are capped before they reach the page.

export type QuakeEvent = Quake & { at: number; felt: string | null };
// `cells` are the 0.2° squares the warning covers, as [lon × 5, lat × 5] integers.
export type Warning = { headline: string; area: string; until: string; untilMs: number; districts: number; hazards: Hazard[]; cells: [number, number][] };

const list = (raw: unknown) => {
  const g = (raw as { Infogempa?: { gempa?: unknown } })?.Infogempa?.gempa;
  return Array.isArray(g) ? (g.slice(0, 30) as Record<string, unknown>[]) : [];
};

// The M5+ list's terse place, "130 km BaratDaya MALUKUTENGGARA-MALUKU", as "130 km Barat Daya Maluku Tenggara": compass
// words spaced, the province code dropped, and the run-together regency split before its common trailing words.
const spaced = (place: string) =>
  place
    .replace(/(Barat|Timur)(Daya|Laut)/, "$1 $2")
    .replace(/\b([A-Z]{3,})(-[A-Z-]+)?$/, (_, name: string) =>
      name
        .replace(/\B(BARAT|TIMUR|UTARA|SELATAN|TENGGARA|TENGAH|DAYA|JAYA|BAGIAN)/g, " $1")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    );

// The M5+ list (gempaterkini.json) and the felt list (gempadirasakan.json), merged on their timestamp, newest first.
// A quake on both keeps the felt list's place, which reads as a sentence, and the M5+ list's tsunami line.
export function parseQuakeLists(strong: unknown, felt: unknown): QuakeEvent[] {
  const byTime = new Map<number, QuakeEvent>();
  for (const [items, isFelt] of [
    [list(strong), false],
    [list(felt), true],
  ] as const) {
    for (const g of items) {
      const q = parseQuake({ Infogempa: { gempa: g } });
      const at = Date.parse(String(g.DateTime ?? ""));
      if (!q || !Number.isFinite(at)) continue;
      const place = isFelt ? q.place.replace(/^Pusat gempa berada /, "") : spaced(q.place);
      const was = byTime.get(at);
      byTime.set(at, {
        ...q,
        place: isFelt || !was ? place : was.place,
        potential: was?.potential || q.potential,
        at,
        felt: isFelt && typeof g.Dirasakan === "string" ? g.Dirasakan.slice(0, 200) : (was?.felt ?? null),
      });
    }
  }
  return [...byTime.values()].sort((a, b) => b.at - a.at);
}

// The alert links in the nowcast RSS feed, each a CAP document with the warning's polygons.
export function parseNowcast(rss: string): string[] {
  return [...rss.matchAll(/<link>(https:\/\/www\.bmkg\.go\.id\/alerts\/nowcast\/id\/[A-Za-z0-9]+_alert\.xml)<\/link>/g)]
    .map((m) => m[1])
    .slice(0, 40);
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? "";
const ZONE: Record<string, string> = { "+07:00": "WIB", "+08:00": "WITA", "+09:00": "WIT" };

function inside(px: number, py: number, ring: [number, number][]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// One CAP alert: its area, expiry in local time, the hazards its impact sentence names, and the squares it covers.
// A square counts when its centre falls inside a polygon, or a polygon corner falls in it, so small districts still show.
export function parseCap(xml: string): Warning | null {
  const headline = tag(xml, "headline").slice(0, 160);
  const expires = tag(xml, "expires");
  const untilMs = Date.parse(expires);
  const description = tag(xml, "description");
  if (!headline || !Number.isFinite(untilMs)) return null;
  const cells = new Map<string, [number, number]>();
  const add = (cx: number, cy: number) => cells.size < 600 && cells.set(`${cx},${cy}`, [cx, cy]);
  for (const [, body] of xml.matchAll(/<polygon>([\s\S]*?)<\/polygon>/g)) {
    const ring = body
      .trim()
      .split(/\s+/)
      .map((p) => p.split(",").map(Number) as [number, number])
      .filter(([lat, lon]) => lat > -15 && lat < 10 && lon > 90 && lon < 145)
      .map(([lat, lon]) => [lon * 5, lat * 5] as [number, number]);
    if (ring.length < 3) continue;
    ring.forEach(([x, y]) => add(Math.round(x), Math.round(y)));
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    for (let cx = Math.round(Math.min(...xs)); cx <= Math.round(Math.max(...xs)); cx++)
      for (let cy = Math.round(Math.min(...ys)); cy <= Math.round(Math.max(...ys)); cy++) if (inside(cx, cy, ring)) add(cx, cy);
  }
  const impact = description.match(/dampak berupa ([^.]*)/)?.[1] ?? description;
  const hazards = (["banjir", "angin", "longsor"] as const).filter((h) => impact.includes(h));
  return {
    headline,
    area: tag(xml, "areaDesc").slice(0, 80) || headline.replace(/^.* di /, ""),
    until: `${expires.slice(11, 16).replace(":", ".")} ${ZONE[expires.slice(19)] ?? ""}`.trim(),
    untilMs,
    districts: description.match(/khususnya di ([^.]*)\./)?.[1].split(",").length ?? 0,
    hazards,
    cells: [...cells.values()],
  };
}

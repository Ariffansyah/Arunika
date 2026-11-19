"use client";

import { Activity, CloudLightning } from "lucide-react";
import { ago, useNow } from "@/components/useNow";
import type { QuakeEvent, Warning } from "@/lib/bmkgFeed";
import { num } from "@/lib/format";
import { depthOf } from "./LiveBoard";

// BMKG's latest quakes and warnings crawling along the foot of the hero, linking down to the live board.
export default function Ticker({ quakes, warnings }: { quakes: QuakeEvent[]; warnings: Pick<Warning, "headline" | "until" | "untilMs">[] }) {
  const now = useNow();
  const items = [
    ...quakes.slice(0, 8).map((q) => ({
      key: `q${q.at}`,
      Icon: Activity,
      color: depthOf(q.depthKm).color,
      text: `M${num(q.magnitude, 1)} ${q.place}`,
      when: ago(q.at, now) ?? q.time,
    })),
    ...warnings
      .filter((w) => !now || w.untilMs > now)
      .map((w) => ({ key: `w${w.headline}`, Icon: CloudLightning, color: "#3d7bf5", text: w.headline, when: `hingga ${w.until}` })),
  ];
  if (!items.length) return null;
  // Two copies side by side: the strip slides one copy's width, then starts over without a seam.
  const strip = (copy: number) =>
    items.map(({ key, Icon, color, text, when }) => (
      <span key={`${copy}${key}`} className="flex items-center gap-2 px-6 whitespace-nowrap">
        <Icon className="size-4 shrink-0" style={{ color }} />
        {text}
        <span className="text-redup">· {when}</span>
      </span>
    ));
  return (
    <a
      href="#bmkg"
      aria-label="Lihat pantauan BMKG langsung"
      className="group flex h-11 items-center overflow-hidden border-t border-pasir/15 bg-malam/80 text-pasir/90 transition-colors hover:bg-malam"
    >
      <span className="flex h-full shrink-0 items-center gap-2 border-r border-pasir/15 bg-malam px-4 font-mono font-bold">
        <span className="size-2 animate-pulse rounded-full bg-bahaya" />
        BMKG
      </span>
      <span aria-hidden="true" className="flex min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_3%,#000_97%,transparent)]">
        <span className="flex shrink-0 motion-safe:animate-marquee group-hover:[animation-play-state:paused]">
          {strip(0)}
          {strip(1)}
        </span>
      </span>
    </a>
  );
}

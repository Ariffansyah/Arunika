"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { H, W } from "@/lib/campus";
import { INTENSITY, type Scenario } from "@/lib/sim";
import { supabase, type School } from "@/lib/supabase";
import { player, remotes, startDrill } from "./drillStore";

export type Peer = { id: string; name: string; avatar: number };
type Status = "connecting" | "online" | "offline";

const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && v >= lo && v <= hi ? v : null);

// Broadcasts come from other browsers, so every field is checked before it touches game state.
function parseScenario(p: unknown): Scenario | null {
  const s = p as { kind?: unknown; intensity?: unknown } | null;
  if (s?.kind !== "gempa" && s?.kind !== "banjir") return null;
  const v = num(s.intensity, ...INTENSITY[s.kind].range);
  return v === null ? null : { kind: s.kind, intensity: v };
}

export function useRoom(room: string, me: { id: string; name: string; avatar: number }, school: School | null) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const channel = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const sb = supabase();
    const ch = sb.channel(`room:${room}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    channel.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<{ name: string; avatar: number }>();
      const list = Object.entries(state)
        .filter(([id]) => id !== me.id)
        .map(([id, metas]) => ({
          id,
          name: String(metas[0]?.name ?? "Tamu").slice(0, 40),
          avatar: num(metas[0]?.avatar, 0, 5) ?? 0,
        }));
      for (const id of remotes.keys()) if (!list.some((p) => p.id === id)) remotes.delete(id);
      setPeers(list);
    })
      .on("broadcast", { event: "pos" }, ({ payload }) => {
        const x = num(payload?.x, 0, W);
        const z = num(payload?.z, 0, H);
        if (typeof payload?.id === "string" && x !== null && z !== null) {
          remotes.set(payload.id, { x, z, crouch: payload.c === true, at: Date.now() });
        }
      })
      .on("broadcast", { event: "drill" }, ({ payload }) => {
        const s = parseScenario(payload?.scenario);
        if (s) startDrill(s, school);
      })
      .subscribe(async (st) => {
        if (st === "SUBSCRIBED") {
          setStatus("online");
          await ch.track({ name: me.name, avatar: me.avatar });
        } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
          setStatus("offline");
        }
      });

    // 5 Hz and only after movement keeps us well inside Supabase's free-tier message quota.
    let last = "";
    const timer = setInterval(() => {
      const msg = `${player.x.toFixed(2)},${player.z.toFixed(2)},${player.crouch}`;
      if (msg === last) return;
      last = msg;
      ch.send({ type: "broadcast", event: "pos", payload: { id: me.id, x: player.x, z: player.z, c: player.crouch } });
    }, 200);

    return () => {
      clearInterval(timer);
      channel.current = null;
      remotes.clear();
      sb.removeChannel(ch);
    };
  }, [room, me.id, me.name, me.avatar, school]);

  const broadcastDrill = (scenario: Scenario) =>
    channel.current?.send({ type: "broadcast", event: "drill", payload: { scenario } });

  return { peers, status, broadcastDrill };
}

"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { SITE_D, SITE_W } from "@/lib/campus";
import { classrooms } from "@/lib/floorplan";
import { INTENSITY, type Scenario } from "@/lib/sim";
import { supabase, type School } from "@/lib/supabase";
import { net, player, remotes, startDrill } from "./drillStore";
import { isDoor, raiseAlarm, setDoor } from "./interact";

export type Peer = { id: string; name: string; avatar: number };
type Status = "connecting" | "online" | "offline";

const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && v >= lo && v <= hi ? v : null);

// Broadcasts come from other browsers, so every field is checked before it touches game state.
function parseScenario(p: unknown): Scenario | null {
  const s = p as { kind?: unknown; intensity?: unknown } | null;
  if (typeof s?.kind !== "string" || !Object.hasOwn(INTENSITY, s.kind)) return null;
  const kind = s.kind as Scenario["kind"];
  const v = num(s.intensity, ...INTENSITY[kind].range);
  return v === null ? null : { kind, intensity: v };
}

export function useRoom(room: string, me: { id: string; name: string; avatar: number }, school: School | null) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const channel = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const sb = supabase();
    const ch = sb.channel(`room:${room}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    channel.current = ch;

    let joined = false;
    let last = "";
    let lastAt = 0;

    ch.on("presence", { event: "join" }, () => {
      // Positions are only broadcast on change, so a newcomer would never see someone standing still.
      last = "";
    })
      .on("presence", { event: "sync" }, () => {
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
        const x = num(payload?.x, 0, SITE_W);
        const z = num(payload?.z, 0, SITE_D);
        const layer = payload?.f === 1 ? 1 : 0;
        if (typeof payload?.id === "string" && x !== null && z !== null) {
          remotes.set(payload.id, { x, z, layer, crouch: payload.c === true, at: Date.now() });
        }
      })
      .on("broadcast", { event: "door" }, ({ payload }) => {
        if (typeof payload?.id === "string" && isDoor(payload.id)) setDoor(payload.id, payload.open === true, false);
      })
      .on("broadcast", { event: "alarm" }, () => raiseAlarm(false))
      .on("broadcast", { event: "drill" }, ({ payload }) => {
        const s = parseScenario(payload?.scenario);
        const room = classrooms().find((r) => r.id === payload?.room)?.id;
        const seed = num(payload?.seed, 0, 2 ** 31);
        if (s && room && seed !== null) startDrill(s, school, 1500, room, Math.floor(seed));
      })
      .subscribe(async (st) => {
        if (st === "SUBSCRIBED") {
          joined = true;
          net.send = (event, payload) => void ch.send({ type: "broadcast", event, payload });
          setStatus("online");
          await ch.track({ name: me.name, avatar: me.avatar });
        } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
          joined = false;
          net.send = null;
          setStatus("offline");
        }
      });

    // 5 Hz, only after movement (plus a slow heartbeat), keeps us well inside Supabase's free-tier message quota.
    // Sending before the channel joins would fall back to one HTTP request per message.
    const timer = setInterval(() => {
      if (!joined) return;
      const msg = `${player.x.toFixed(2)},${player.z.toFixed(2)},${player.layer},${player.crouch}`;
      const now = Date.now();
      if (msg === last && now - lastAt < 3000) return;
      last = msg;
      lastAt = now;
      ch.send({ type: "broadcast", event: "pos", payload: { id: me.id, x: player.x, z: player.z, f: player.layer, c: player.crouch } });
    }, 200);

    return () => {
      clearInterval(timer);
      net.send = null;
      channel.current = null;
      remotes.clear();
      sb.removeChannel(ch);
    };
  }, [room, me.id, me.name, me.avatar, school]);

  const broadcastDrill = (scenario: Scenario, room: string, seed: number) =>
    channel.current?.send({ type: "broadcast", event: "drill", payload: { scenario, room, seed } });

  return { peers, status, broadcastDrill };
}

"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { groundY } from "@/lib/nav";
import { avatarOf } from "@/lib/supabase";
import type { Anim } from "@/components/Character";
import Avatar from "./Avatar";
import { remotes } from "./drillStore";
import type { Peer } from "./useRoom";

function Remote({ peer }: { peer: Peer }) {
  const ref = useRef<Group>(null);
  const shown = useRef({ x: NaN, z: NaN, anim: "idle" as Anim, speed: 0, heading: 0 });

  useFrame((_, dt) => {
    const target = remotes.get(peer.id);
    const g = ref.current;
    if (!g) return;
    g.visible = Boolean(target);
    if (!target) return;
    const s = shown.current;
    // Snap on first sight or a big jump (drill restart) instead of sliding across the map.
    if (Number.isNaN(s.x) || Math.hypot(target.x - s.x, target.z - s.z) > 12) Object.assign(s, { x: target.x, z: target.z });
    // Positions arrive at ~5 Hz; ease toward them so movement looks continuous.
    const k = Math.min(1, dt * 10);
    const nx = s.x + (target.x - s.x) * k;
    const nz = s.z + (target.z - s.z) * k;
    // Easing slows each glide to a stop before the next update, so judge walking from a smoothed speed:
    // a per-frame test flickers between walk and idle five times a second and restarts the clip each time.
    s.speed += (Math.hypot(nx - s.x, nz - s.z) / Math.max(dt, 1e-3) - s.speed) * Math.min(1, dt * 3);
    if (s.speed > 0.4) {
      const d = Math.atan2(nx - s.x, nz - s.z) - s.heading;
      s.heading += Math.atan2(Math.sin(d), Math.cos(d)) * (1 - Math.exp(-dt * 10));
    }
    g.rotation.y = s.heading;
    s.x = nx;
    s.z = nz;
    s.anim = target.anim;
    g.position.set(s.x, groundY(s.x, s.z, target.layer), s.z);
  });

  return (
    <group ref={ref} visible={false}>
      <Avatar
        look={avatarOf(peer.avatar)}
        name={peer.name}
        anim={() => {
          // Postures come from the sender; pace comes from the smoothed speed, which arrives more often than poses change.
          const s = shown.current;
          if (!["idle", "walk", "sprint"].includes(s.anim)) return s.anim === "crouchWalk" ? ["crouchWalk", s.speed / 0.9] : s.anim;
          return s.speed > 2.4 ? ["sprint", s.speed / 3.5] : s.speed > 0.4 ? ["walk", s.speed / 1.5] : "idle";
        }}
      />
    </group>
  );
}

export default function RemotePlayers({ peers }: { peers: Peer[] }) {
  return peers.map((p) => <Remote key={p.id} peer={p} />);
}

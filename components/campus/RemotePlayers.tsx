"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { elevationAt } from "@/lib/campus";
import { avatarOf } from "@/lib/supabase";
import Avatar from "./Avatar";
import { remotes } from "./drillStore";
import type { Peer } from "./useRoom";

function Remote({ peer }: { peer: Peer }) {
  const ref = useRef<Group>(null);
  const shown = useRef({ x: NaN, z: NaN, crouch: false, moving: false });

  useFrame((_, dt) => {
    const target = remotes.get(peer.id);
    const g = ref.current;
    if (!g) return;
    g.visible = Boolean(target);
    if (!target) return;
    const s = shown.current;
    // Snap on first sight or a big jump (drill restart) instead of sliding across the map.
    if (Number.isNaN(s.x) || Math.hypot(target.x - s.x, target.z - s.z) > 4) Object.assign(s, { x: target.x, z: target.z });
    // Positions arrive at ~5 Hz; ease toward them so movement looks continuous.
    const k = Math.min(1, dt * 10);
    const nx = s.x + (target.x - s.x) * k;
    const nz = s.z + (target.z - s.z) * k;
    s.moving = Math.hypot(nx - s.x, nz - s.z) > 0.01;
    if (s.moving) g.rotation.y = Math.atan2(nx - s.x, nz - s.z);
    s.x = nx;
    s.z = nz;
    s.crouch = target.crouch;
    g.position.set(s.x, elevationAt(s.x, s.z), s.z);
  });

  return (
    <group ref={ref} visible={false}>
      <Avatar
        look={avatarOf(peer.avatar).look}
        wheelchair={avatarOf(peer.avatar).wheelchair}
        name={peer.name}
        anim={() => {
          const s = shown.current;
          if (avatarOf(peer.avatar).wheelchair) return s.moving ? "wheelchair-move-forward" : "wheelchair-sit";
          return s.crouch ? "crouch" : s.moving ? "sprint" : "idle";
        }}
      />
    </group>
  );
}

export default function RemotePlayers({ peers }: { peers: Peer[] }) {
  return peers.map((p) => <Remote key={p.id} peer={p} />);
}

"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { elevationAt } from "@/lib/campus";
import { AVATARS } from "@/lib/supabase";
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
    if (Number.isNaN(s.x)) Object.assign(s, target);
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
        look={AVATARS[peer.avatar] ?? AVATARS[0]}
        name={peer.name}
        anim={() => (shown.current.crouch ? "sit" : shown.current.moving ? "sprint" : "idle")}
      />
    </group>
  );
}

export default function RemotePlayers({ peers }: { peers: Peer[] }) {
  return peers.map((p) => <Remote key={p.id} peer={p} />);
}

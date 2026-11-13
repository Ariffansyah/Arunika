"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import RequireAuth, { Notice, type Me } from "@/components/RequireAuth";
import { SPAWN } from "@/lib/campus";
import type { Scenario } from "@/lib/sim";
import { AVATAR_COLORS } from "@/lib/supabase";
import { player, setState, startDrill } from "./drillStore";
import Hud, { ROOM_PATTERN } from "./Hud";
import { useRoom } from "./useRoom";
import WardenChat from "./WardenChat";

const World = dynamic(() => import("./World"), {
  ssr: false,
  loading: () => <Notice>Memuat kampus 3D…</Notice>,
});

function Campus({ me, roomParam }: { me: Me; roomParam: string | null }) {
  const room = roomParam && ROOM_PATTERN.test(roomParam) ? roomParam : (me.profile.school_id ?? "umum");
  const self = { id: me.profile.id, name: me.profile.display_name, avatar: me.profile.avatar };
  const { peers, status, broadcastDrill } = useRoom(room, self, me.school);

  // The store is module state, so a revisit would otherwise resume a stale drill.
  useEffect(() => {
    Object.assign(player, { x: SPAWN[0] + 0.5, z: SPAWN[1] + 0.5, heading: 0, crouch: false });
    setState({ phase: "idle", result: null, showRoute: false, chatOpen: false });
  }, [room]);

  const onStart = (s: Scenario) => {
    startDrill(s, me.school);
    broadcastDrill(s);
  };

  return (
    <div className="fixed inset-0">
      <h1 className="sr-only">Kampus 3D {me.school?.name ?? ""}</h1>
      <World me={{ name: self.name, color: AVATAR_COLORS[self.avatar] ?? AVATAR_COLORS[0] }} peers={peers} school={me.school} />
      <Hud room={room} peers={peers} status={status} school={me.school} onStart={onStart} />
      <WardenChat />
    </div>
  );
}

export default function CampusClient() {
  const params = useSearchParams();
  return <RequireAuth>{(me) => <Campus me={me} roomParam={params.get("room")} />}</RequireAuth>;
}

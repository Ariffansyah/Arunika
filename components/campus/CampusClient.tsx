"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import RequireAuth, { Notice, type Me } from "@/components/RequireAuth";
import { SPAWN, tileCenter } from "@/lib/campus";
import type { Scenario } from "@/lib/sim";
import { avatarOf } from "@/lib/supabase";
import { player, setState, startDrill } from "./drillStore";
import Hud, { ROOM_PATTERN } from "./Hud";
import { useRoom } from "./useRoom";
import WardenChat from "./WardenChat";

const World = dynamic(() => import("./World"), {
  ssr: false,
  loading: () => <Notice>Memuat kampus…</Notice>,
});

function Campus({ me, roomParam }: { me: Me; roomParam: string | null }) {
  const room = roomParam && ROOM_PATTERN.test(roomParam) ? roomParam : (me.profile.school_id ?? "umum");
  const self = { id: me.profile.id, name: me.profile.display_name, avatar: me.profile.avatar };
  const { peers, status, broadcastDrill } = useRoom(room, self, me.school);

  // The store is module state, so a revisit would otherwise resume a stale drill.
  useEffect(() => {
    const [x, z] = tileCenter(...SPAWN);
    Object.assign(player, { x, z, heading: 0, crouch: false, moving: false, running: false, wading: false });
    setState({ phase: "idle", result: null, showRoute: false, chatOpen: false });
  }, [room]);

  const onStart = (s: Scenario) => {
    startDrill(s, me.school);
    broadcastDrill(s);
  };

  return (
    <div className="fixed inset-0">
      <h1 className="sr-only">Kampus {me.school?.name ?? ""}</h1>
      <World me={{ name: self.name, look: avatarOf(self.avatar) }} peers={peers} school={me.school} />
      <Hud room={room} peers={peers} status={status} school={me.school} onStart={onStart} />
      <WardenChat />
    </div>
  );
}

export default function CampusClient() {
  const params = useSearchParams();
  return <RequireAuth>{(me) => <Campus me={me} roomParam={params.get("room")} />}</RequireAuth>;
}

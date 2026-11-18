"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import RequireAuth, { type Me } from "@/components/RequireAuth";
import { MAP, SPAWN, mapFromUrl, tileCenter } from "@/lib/campus";
import { groundY } from "@/lib/nav";
import type { Scenario } from "@/lib/sim";
import { avatarOf } from "@/lib/supabase";
import { player, setState, startDrill } from "./drillStore";
import Hud, { ROOM_PATTERN } from "./Hud";
import Loading from "./Loading";
import MapMenu from "./MapMenu";
import { useRoom } from "./useRoom";
import WardenChat from "./WardenChat";

const World = dynamic(() => import("./World"), {
  ssr: false,
  // The loading screen covers the wait.
  loading: () => null,
});

function Campus({ me, roomParam }: { me: Me; roomParam: string | null }) {
  const room = roomParam && ROOM_PATTERN.test(roomParam) ? roomParam : (me.profile.school_id ?? "umum");
  const [avatar, setAvatar] = useState(me.profile.avatar);
  const self = { id: me.profile.id, name: me.profile.display_name, avatar };
  const { peers, status, broadcastDrill } = useRoom(room, self, me.school);
  const [ready, setReady] = useState(false);

  // The campus modules load once per page, possibly on another page with another map: start over on this one.
  useEffect(() => {
    if (MAP.id !== mapFromUrl(location.search)) location.reload();
  }, []);

  // The store is module state, so a revisit would otherwise resume a stale drill.
  useEffect(() => {
    const [x, z] = tileCenter(...SPAWN);
    Object.assign(player, { x, z, layer: 0, y: groundY(x, z, 0), heading: 0, crouch: false, moving: false, running: false, wading: false, seated: false });
    setState({ phase: "idle", result: null, showRoute: false, chatOpen: false });
  }, [room]);

  const onStart = (s: Scenario) => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    // Long enough to read where the drill starts.
    startDrill(s, me.school, 3000, seed);
    broadcastDrill(s, seed);
  };

  return (
    <div className="fixed inset-0">
      <h1 className="sr-only">
        {me.school?.name ?? "Sekolah contoh"} · {MAP.name}
      </h1>
      <World me={{ name: self.name, look: avatarOf(self.avatar) }} peers={peers} school={me.school} onReady={() => setReady(true)} />
      <div className="contents" inert={!ready}>
        <Hud
          me={{ id: self.id, avatar, onAvatar: setAvatar }}
          room={room}
          peers={peers}
          status={status}
          school={me.school}
          onStart={onStart}
          // Practice is solo: it is not sent to the others in the room.
          onGuided={(s) => startDrill(s, me.school, 3000, undefined, true)}
        />
        <WardenChat school={me.school} name={self.name} />
      </div>
      <Loading id={MAP.id} ready={ready} />
    </div>
  );
}

export default function CampusClient() {
  const params = useSearchParams();
  const search = params.toString();
  // Without a map in the address, the menu comes first.
  if (!params.has("peta")) return <RequireAuth>{(me) => <MapMenu me={me} search={search} />}</RequireAuth>;
  return (
    <RequireAuth loading={<Loading id={mapFromUrl(search)} />}>
      {(me) => <Campus me={me} roomParam={params.get("room")} />}
    </RequireAuth>
  );
}

import { WARDEN, tileCenter } from "@/lib/campus";
import { PLAN, WALL } from "@/lib/floorplan";
import { groundY, type Extra } from "@/lib/nav";
import { QUAKE_SHAKE_S } from "@/lib/sim";
import { finishDrill, getState, net, openChat, player, run, setState, type Prompt } from "./drillStore";
import { kentongan } from "./sound";

const REACH = 1.4;
// Desks and tables are cover; a desk's id is its index in PLAN.items.
const COVER = PLAN.items.flatMap((it, i) => (it.model === "desk" || it.model === "table" ? [i] : []));
const DOORS = new Map(PLAN.doors.map((d) => [d.id, d]));
const SPOT_LABEL = {
  peta: () => "Lihat peta evakuasi",
  mcb: () => (getState().power ? "Matikan listrik" : "Nyalakan listrik"),
  gas: () => (getState().gas ? "Tutup katup gas" : "Buka katup gas"),
  kentongan: () => "Bunyikan kentongan",
};

export const isDoor = (id: string) => DOORS.has(id);

export function setDoor(id: string, open: boolean, tell = true) {
  const closed = getState().closedDoors;
  if (open !== closed.includes(id)) return;
  setState({ closedDoors: open ? closed.filter((d) => d !== id) : [...closed, id] });
  if (tell) net.send?.("door", { id, open });
}

export function raiseAlarm(tell = true) {
  kentongan();
  if (tell) net.send?.("alarm", {});
}

// A closed door fills its opening like the wall around it, up to the door's height.
export const closedDoors: Extra = (x0, z0, x1, z1, lo, hi) =>
  getState().closedDoors.some((id) => {
    const d = DOORS.get(id)!;
    const [hx, hz] = d.along === "x" ? [d.w / 2, WALL] : [WALL, d.w / 2];
    return d.x - hx < x1 && d.x + hx > x0 && d.z - hz < z1 && d.z + hz > z0 && d.y < hi && d.y + 2.1 > lo;
  });

// Classmates open a closed door in their way, as anyone leaving a room would.
export function openDoorsNear(x: number, z: number, y: number) {
  for (const id of getState().closedDoors) {
    const d = DOORS.get(id)!;
    if (Math.hypot(d.x - x, d.z - z) < 1.2 && Math.abs(d.y - y) < 1) setDoor(id, true, false);
  }
}

export const atGoal = () =>
  player.layer === 0 &&
  run.goals.some((g) => {
    const [gx, gz] = tileCenter(...g);
    return Math.hypot(gx - player.x, gz - player.z) < 4.8;
  });

// The warden waits beside the first safe assembly point during a drill to take reports.
export function wardenSpot(): [number, number] {
  const s = getState();
  if (s.phase !== "running" || !run.goals.length) return tileCenter(...WARDEN);
  const [x, z] = tileCenter(...run.goals[0]);
  return [x + 2.5, z - 2.5];
}

export function findPrompt(): Prompt | null {
  const s = getState();
  const t = (Date.now() - s.startAt) / 1000;
  const running = s.phase === "running";
  const shaking = running && s.scenario.kind === "gempa" && t < QUAKE_SHAKE_S;
  if (running && t >= 0 && !shaking && atGoal()) {
    const [x, z] = wardenSpot();
    return { id: "lapor", label: "Lapor ke petugas", x, y: groundY(x, z, 0) + 2.3, z };
  }
  if (s.chatOpen || s.mapOpen || (running && t < 0)) return null;
  let best: Prompt | null = null;
  let bestD = REACH;
  const consider = (id: string, label: string, x: number, z: number, floorY: number, lift: number) => {
    const d = Math.hypot(x - player.x, z - player.z);
    if (d >= bestD || Math.abs(floorY - player.y) > 1.2) return;
    bestD = d;
    best = { id, label, x, y: floorY + lift, z };
  };
  for (const i of COVER) {
    const it = PLAN.items[i];
    consider(`meja-${i}`, "Berlindung di bawah meja", it.x, it.z, it.y, 1.1);
  }
  for (const d of PLAN.doors) consider(d.id, s.closedDoors.includes(d.id) ? "Buka pintu" : "Tutup pintu", d.x, d.z, d.y, 1.7);
  PLAN.spots.forEach((sp, i) => consider(`${sp.kind}-${i}`, SPOT_LABEL[sp.kind](), sp.x, sp.z, groundY(sp.x, sp.z, sp.floor), 1.9));
  if (!best && !running) {
    const [x, z] = wardenSpot();
    if (Math.hypot(x - player.x, z - player.z) < 4) best = { id: "warden", label: "Tanya petugas", x, y: groundY(x, z, 0) + 2.3, z };
  }
  return best;
}

export function interact() {
  const p = getState().prompt;
  if (!p) return;
  if (p.id === "lapor") return finishDrill(true);
  if (p.id === "warden") return openChat();
  if (p.id.startsWith("meja-")) {
    const desk = PLAN.items[Number(p.id.slice(5))];
    Object.assign(player, { cover: Number(p.id.slice(5)), seated: false, heading: Math.atan2(desk.x - player.x, desk.z - player.z) });
    return;
  }
  if (isDoor(p.id)) return setDoor(p.id, getState().closedDoors.includes(p.id));
  const kind = p.id.split("-")[0];
  if (kind === "mcb") setState({ power: !getState().power });
  else if (kind === "gas") setState({ gas: !getState().gas });
  else if (kind === "kentongan") raiseAlarm();
  else if (kind === "peta") setState({ mapOpen: true });
}

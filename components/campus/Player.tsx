"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3, type Group } from "three";
import { PLAN } from "@/lib/floorplan";
import { buildingAt, free, groundY, layerAt, solidAt, vaultTarget } from "@/lib/nav";
import { CROUCH_SPEED, RUN_SPEED, SLIDE_S, WALK_SPEED, laneDistance, waterLevel } from "@/lib/sim";
import type { Anim, Look } from "@/components/Character";
import Avatar from "./Avatar";
import {
  aftershockAt,
  finishDrill,
  getState,
  input,
  look,
  player,
  resetInput,
  run,
  setState,
  shakingAt,
  trackDrill,
  useDrill,
} from "./drillStore";
import { closedDoors, findPrompt, interact, wardenSpot } from "./interact";
import { play, splash } from "./sound";
import { MAP, SITE_D, SITE_W, TILE, elevationAt, surfaceAt } from "@/lib/campus";

const KEYS: Record<string, keyof typeof input> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyC: "crouch",
  ShiftLeft: "run",
  ShiftRight: "run",
};
const CAM_DIST = 5;
// Seconds of countdown the camera spends flying down from the sky to the player.
const FLY_S = 3;
// A jump: a short crouch, 0.4 s in the air, then the landing squat before walking on.
const VAULT_S = 0.8;
const PACE: Partial<Record<Anim, number>> = { walk: WALK_SPEED, sprint: RUN_SPEED, crouchWalk: CROUCH_SPEED };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest("input, textarea, select") !== null;

function clearReach(from: Vector3, yaw: number, pitch: number, dist: number) {
  const bx = Math.sin(yaw) * Math.cos(pitch);
  const bz = Math.cos(yaw) * Math.cos(pitch);
  const by = Math.sin(pitch);
  for (let d = 0.3; d <= dist; d += 0.15) {
    if (solidAt(from.x + bx * d, from.y + by * d, from.z + bz * d)) return d;
  }
  return dist;
}

export default function Player({ look: character, name }: { look: Look; name: string }) {
  const ref = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const size = useThree((s) => s.size);
  const view = useDrill((s) => s.view);
  const reducedMotion = useRef(false);
  const camDist = useRef(CAM_DIST);
  const camLift = useRef(0);
  const eye = useRef(new Vector3());
  const pivotAt = useRef(new Vector3());
  const tuck = useRef(0);
  const eyeHeight = useRef(1.35);
  const deskAt = useRef<[number, number]>([0, 0]);
  const shownHeading = useRef(0);
  const last = useRef<[number, number]>([player.x, player.z]);
  const vault = useRef<{ x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; arc: number; t: number } | null>(null);
  const pace = useRef(1);
  const stride = useRef(0);
  const bob = useRef(0);
  const bobAmp = useRef(0);
  const wasFirst = useRef(view === "first");
  const aim = useRef(new Vector3());
  // Until the player moves, the menu sits over a slow aerial orbit of the campus; cine is how far the camera is up there.
  const lobby = useRef(true);
  const lastPhase = useRef("idle");
  const cine = useRef(1);
  const needsCursor = useDrill((s) => s.chatOpen || s.mapOpen || s.phase === "done");

  useEffect(() => {
    reducedMotion.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onDown = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const k = KEYS[e.code];
      if (k) {
        input[k] = true;
        e.preventDefault();
      } else if (e.code === "Space" && !e.repeat) {
        input.jump = true;
        e.preventDefault();
      } else if (e.code === "KeyE" && !e.repeat) {
        interact();
        e.preventDefault();
      } else if (e.code === "KeyM" && !e.repeat && !getState().chatOpen) {
        resetInput();
        setState({ mapOpen: !getState().mapOpen });
      } else if (e.code === "Escape" && getState().mapOpen) {
        setState({ mapOpen: false });
      } else if (e.code === "KeyV" && !e.repeat) {
        setState({ view: getState().view === "third" ? "first" : "third" });
      }
    };
    // Releases always count, even inside a text field, so a key held while focus moves can't stay pressed.
    const onUp = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) input[k] = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", resetInput);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", resetInput);
    };
  }, []);

  useEffect(() => {
    // On portrait screens the panels cover the lower half, so the player is framed higher up.
    if (size.height > size.width) camera.setViewOffset(size.width, size.height, 0, size.height * 0.2, size.width, size.height);
    else camera.clearViewOffset();
    return () => camera.clearViewOffset();
  }, [camera, size]);

  // A dialog, the map or the results need the cursor back.
  useEffect(() => {
    if (needsCursor && document.pointerLockElement === canvas) document.exitPointerLock();
  }, [needsCursor, canvas]);

  useEffect(() => {
    let drag: { id: number; x: number; y: number } | null = null;
    const locked = () => document.pointerLockElement === canvas;
    // Only the pitch of the view in use moves, so the other one is never left tilted for the next switch.
    const turn = (dx: number, dy: number, k: number) => {
      look.yaw -= dx * k;
      if (getState().view === "first") look.eyePitch = clamp(look.eyePitch - dy * k, -1.3, 1.2);
      else look.camPitch = clamp(look.camPitch + dy * k * 0.7, -0.75, 1.15);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || locked()) return;
      lobby.current = false;
      // A mouse is taken over as in any game: hidden, turning the view, given back with Esc. Dragging stays
      // for touch, and for a mouse wherever the lock is refused.
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      if (e.pointerType === "mouse") Promise.resolve(canvas.requestPointerLock()).catch(() => {});
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id || locked()) return;
      turn(e.clientX - drag.x, e.clientY - drag.y, 0.006);
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    // Chrome can report one huge jump as the lock starts; no hand moves a mouse that far in one event.
    const mouse = (e: MouseEvent) => locked() && Math.abs(e.movementX) < 300 && Math.abs(e.movementY) < 300 && turn(e.movementX, e.movementY, 0.0028);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    document.addEventListener("mousemove", mouse);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      document.removeEventListener("mousemove", mouse);
      if (locked()) document.exitPointerLock();
    };
  }, [canvas]);

  useFrame((_, delta) => {
    // Up to 0.25 s per frame keeps slow devices at full speed (the drill clock is wall time); bigger gaps are pauses.
    const dt = Math.min(delta, 0.25);
    const s = getState();
    const running = s.phase === "running";
    const t = running ? (Date.now() - s.startAt) / 1000 : 0;
    const water = s.phase === "idle" ? 0 : waterLevel(s.scenario, running ? t : Infinity, run.timeline.rise);
    const depth = water - groundY(player.x, player.z, player.layer);
    const first = s.view === "first";
    // Into first person the eyes start level, whatever the camera was doing before.
    if (first && !wasFirst.current) look.eyePitch = -0.05;
    wasFirst.current = first;

    const ahead = Number(input.up) - Number(input.down);
    const side = Number(input.right) - Number(input.left);
    // Camera-relative: "up" walks away from the camera, whichever way it faces.
    let dx = -Math.sin(look.yaw) * ahead + Math.cos(look.yaw) * side;
    let dz = -Math.cos(look.yaw) * ahead - Math.sin(look.yaw) * side;
    const len = Math.hypot(dx, dz);
    if (s.phase !== lastPhase.current) {
      if (s.phase === "idle") lobby.current = true;
      lastPhase.current = s.phase;
    }
    if (len > 0 || input.crouch || input.jump) lobby.current = false;
    const [ox, oz] = [player.x, player.z];
    const frozen = s.chatOpen || s.mapOpen || (running && t < 0);
    // Talking to the warden: turn to face them, and swing the camera round behind so both faces show.
    if (s.chatOpen) {
      const [wx, wz] = wardenSpot();
      player.heading = Math.atan2(wx - player.x, wz - player.z);
      look.yaw += wrap(player.heading + Math.PI - look.yaw) * (1 - Math.exp(-dt * 4));
    }
    const v = vault.current;
    const jumpPressed = input.jump;
    input.jump = false;

    if (v) {
      const was = v.t;
      v.t += dt;
      if (was < 0.48 && v.t >= 0.48) play("land", 0.5);
      const p = Math.min(1, Math.max(0, (v.t - 0.08) / 0.4));
      player.x = v.x0 + (v.x1 - v.x0) * p;
      player.z = v.z0 + (v.z1 - v.z0) * p;
      player.y = v.y0 + (v.y1 - v.y0) * p + v.arc * Math.sin(Math.PI * p);
      Object.assign(player, { moving: false, running: false, crouch: false });
      if (v.t >= VAULT_S) vault.current = null;
    } else {
      player.crouch = input.crouch && !frozen;
      player.moving = len > 0 && !frozen;
      if (player.moving || player.crouch) player.seated = false;
      if (player.moving) player.cover = -1;
      player.wading = depth > 0.3;
      player.running = player.moving && input.run && !player.wading && !player.crouch;
      if (player.moving) {
        dx /= len;
        dz /= len;
        const water = depth > 1 ? 0.2 : depth > 0.3 ? 0.55 : 1;
        const speed = (player.crouch ? CROUCH_SPEED : player.running ? RUN_SPEED : WALK_SPEED) * water;
        pace.current = water;
        // Small steps so a long frame can't carry the player through a wall corner.
        const steps = Math.ceil(dt / 0.04);
        const step = (speed * dt) / steps;
        for (let i = 0; i < steps; i++) {
          const nx = player.x + dx * step;
          if (free(nx, player.z, layerAt(nx, player.z, player.layer), undefined, closedDoors)) player.x = nx;
          const nz = player.z + dz * step;
          if (free(player.x, nz, layerAt(player.x, nz, player.layer), undefined, closedDoors)) player.z = nz;
          player.layer = layerAt(player.x, player.z, player.layer);
        }
        player.heading = Math.atan2(dx, dz);
      } else if (first) {
        player.heading = look.yaw + Math.PI;
      }
    }

    // A jump needs a run-up on firm, still ground: not ducking, seated, in deep water or while it shakes.
    const quake = running && s.scenario.kind === "gempa" && (shakingAt(t) || aftershockAt(t));
    const canVault = !v && !frozen && !player.crouch && player.cover < 0 && player.layer === 0 && depth < 0.5 && !quake;
    const landing = canVault ? vaultTarget(player.x, player.z, player.heading, closedDoors) : null;
    if (landing && jumpPressed) {
      const y1 = groundY(landing.x, landing.z, 0);
      vault.current = { x0: player.x, z0: player.z, y0: player.y, x1: landing.x, z1: landing.z, y1, arc: Math.max(0.25, landing.top - Math.max(player.y, y1) - 0.35), t: 0 };
    }
    const label = landing ? { x: (player.x + landing.x) / 2, y: landing.top + 0.6, z: (player.z + landing.z) / 2 } : null;
    const shown = s.vaultAt;
    if (!label !== !shown || (label && shown && Math.hypot(label.x - shown.x, label.z - shown.z) > 0.3)) setState({ vaultAt: label });
    const moved = Math.hypot(player.x - ox, player.z - oz);
    if (running && t >= 0) run.walked += moved;
    // The eyes dip once per footfall in first person, gently, and not at all for reduced motion.
    bob.current += (moved * Math.PI) / (player.running ? 1.15 : player.crouch ? 0.55 : 0.75);
    const amp = first && player.moving && !reducedMotion.current ? (player.running ? 0.045 : 0.022) : 0;
    bobAmp.current += (amp - bobAmp.current) * (1 - Math.exp(-dt * 8));
    // A footfall every stride, sounding like what is underfoot.
    stride.current = player.moving ? stride.current + moved : 0;
    if (stride.current >= (player.running ? 1.15 : player.crouch ? 0.55 : 0.75)) {
      stride.current = 0;
      const loud = player.running ? 0.55 : player.crouch ? 0.2 : 0.35;
      if (depth > 0.12) splash(loud);
      else play(buildingAt(player.x, player.z) || surfaceAt(Math.floor(player.x / TILE), Math.floor(player.z / TILE)) ? "step-concrete" : "step-grass", loud);
    }

    if (running && t >= 0) {
      trackDrill(dt, t, Math.hypot(player.x - ox, player.z - oz), depth);
      if (t > run.timeline.limit) finishDrill(false);
    }

    // Eased, so a step onto a floor or a stair reads as a step; a teleport snaps.
    const ground = groundY(player.x, player.z, player.layer);
    if (!vault.current) player.y = Math.abs(ground - player.y) > 1.5 ? ground : player.y + (ground - player.y) * (1 - Math.exp(-dt * 14));
    // The body turns toward where it heads instead of snapping round; after a teleport it faces the new way at once.
    const jumped = Math.hypot(player.x - last.current[0], player.z - last.current[1]) > 2;
    last.current = [player.x, player.z];
    shownHeading.current = jumped ? player.heading : shownHeading.current + wrap(player.heading - shownHeading.current) * (1 - Math.exp(-dt * 12));
    player.anim = vault.current
      ? "vault"
      : player.cover >= 0
        ? "cover"
        : player.crouch
          ? player.moving
            ? "crouchWalk"
            : "crouch"
          : player.running
            ? "sprint"
            : player.moving
              ? "walk"
              : player.seated
                ? "sit"
                : "idle";
    // Curled up, the body slides right under the desk; the player stays where they stood, which is clear of it.
    // The camera follows the body, so the first-person eye ends up under the desk too, not inside a chair.
    const desk = PLAN.items[player.cover];
    if (desk) deskAt.current = [desk.x, desk.z];
    tuck.current += ((desk ? 1 : 0) - tuck.current) * (1 - Math.exp(-dt * 10));
    const bodyX = player.x + (deskAt.current[0] - player.x) * tuck.current;
    const bodyZ = player.z + (deskAt.current[1] - player.z) * tuck.current;
    const g = ref.current;
    if (g) {
      g.position.set(bodyX, player.y, bodyZ);
      g.rotation.y = shownHeading.current;
      g.visible = !first;
    }

    // The ground trembles under a slide too, more the closer it runs.
    const lane = MAP.runouts[run.lane];
    const slide = run.timeline.slide;
    const sliding = running && s.scenario.kind === "longsor" && lane && slide !== null && t >= slide && t < slide + SLIDE_S + 1;
    const strength =
      running && s.scenario.kind === "gempa"
        ? shakingAt(t)
          ? 1
          : aftershockAt(t)
            ? 0.45
            : 0
        : sliding
          ? 0.6 * Math.exp(-Math.max(0, laneDistance(lane, player.x, player.z) - lane.r) / 25)
          : 0;
    const shake = strength * (0.05 + (s.scenario.intensity - 5) * 0.04) * (reducedMotion.current ? 0.2 : 1);
    const jitter = () => (Math.random() - 0.5) * shake;
    // Eased like the body's own crossfade, so ducking or standing up doesn't jolt the view.
    const eyeTo = player.cover >= 0 ? 0.5 : player.crouch ? 0.75 : player.seated ? 1.05 : 1.35;
    eyeHeight.current += (eyeTo - eyeHeight.current) * (1 - Math.exp(-dt * 10));
    const target = eye.current.set(bodyX, player.y + eyeHeight.current - Math.abs(Math.sin(bob.current)) * bobAmp.current, bodyZ);

    if (first) {
      camera.position.set(target.x + jitter(), target.y + jitter(), target.z + jitter());
      const c = Math.cos(look.eyePitch);
      aim.current.set(target.x - Math.sin(look.yaw) * c, target.y + Math.sin(look.eyePitch), target.z - Math.cos(look.yaw) * c);
    } else {
      // Something between camera and player: swing up a little first, then pull in; whatever still blocks the view fades.
      // Indoors the ceiling leaves no room to swing up, so the camera only pulls in. Looking up, the camera sinks
      // toward the ground behind the player, and the ground it meets only pulls it in, as in most third-person games.
      const pivot = pivotAt.current.set(target.x, target.y + 0.4, target.z);
      const maxLift = buildingAt(player.x, player.z) || look.camPitch < 0.1 ? 0 : 0.45;
      let lift = 0;
      while (lift < maxLift && clearReach(pivot, look.yaw, Math.min(1.45, look.camPitch + lift), CAM_DIST) < CAM_DIST) lift += 0.05;
      camLift.current += (lift - camLift.current) * (1 - Math.exp(-dt * 6));
      const pitch = Math.min(1.45, look.camPitch + camLift.current);
      const reach = Math.max(0.4, clearReach(pivot, look.yaw, pitch, CAM_DIST) - 0.3);
      camDist.current = reach < camDist.current ? reach : camDist.current + (reach - camDist.current) * (1 - Math.exp(-dt * 4));
      const d = camDist.current;
      const bx = Math.sin(look.yaw) * Math.cos(pitch);
      const bz = Math.cos(look.yaw) * Math.cos(pitch);
      const by = Math.sin(pitch);
      camera.position.set(pivot.x + bx * d + jitter(), pivot.y + by * d + jitter(), pivot.z + bz * d + jitter());
      aim.current.copy(pivot);
    }

    // A drill opens on the aerial view and flies down to the player through the countdown; the lobby eases in and out.
    if (running && t < 0) cine.current = reducedMotion.current ? 0 : Math.min(1, -t / FLY_S);
    else {
      const to = s.phase === "idle" && lobby.current ? 1 : 0;
      cine.current = reducedMotion.current ? to : cine.current + (to - cine.current) * (1 - Math.exp(-dt * 1.5));
    }
    const k = cine.current * cine.current * (3 - 2 * cine.current);
    look.cine = k;
    if (k > 0.001) {
      const a = reducedMotion.current ? 0.6 : (Date.now() / 1000) * 0.04;
      const r = Math.max(SITE_W, SITE_D) * 0.62;
      const [cx, cz] = [SITE_W / 2, SITE_D / 2];
      const cy = elevationAt(cx, cz);
      const p = camera.position;
      // Across first and down last, so the camera drops onto the player from above instead of through the walls around them.
      const kv = Math.sqrt(k);
      p.set(p.x + (cx + Math.sin(a) * r - p.x) * k, p.y + (cy + r * 0.5 - p.y) * kv, p.z + (cz + Math.cos(a) * r - p.z) * k);
      aim.current.lerp(pivotAt.current.set(cx, cy, cz), k);
    }
    camera.lookAt(aim.current);

    const prompt = findPrompt();
    if (prompt?.id !== s.prompt?.id || prompt?.label !== s.prompt?.label) setState({ prompt });
  });

  return (
    <group ref={ref}>
      <Avatar
        look={character}
        name={name}
        self
        label={view === "third"}
        anim={() => {
          const p = PACE[player.anim];
          return p ? [player.anim, pace.current] : player.anim;
        }}
      />
    </group>
  );
}

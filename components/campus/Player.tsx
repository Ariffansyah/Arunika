"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3, type Group } from "three";
import { PLAN } from "@/lib/floorplan";
import { buildingAt, free, groundY, layerAt, solidAt, vaultTarget } from "@/lib/nav";
import { CROUCH_SPEED, RUN_SPEED, WALK_SPEED, waterLevel } from "@/lib/sim";
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
import { closedDoors, findPrompt, interact } from "./interact";
import { play, splash } from "./sound";
import { TILE, surfaceAt } from "@/lib/campus";

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
// A jump: a short crouch, 0.4 s in the air, then the landing squat before walking on.
const VAULT_S = 0.8;
const PACE: Partial<Record<Anim, number>> = { walk: WALK_SPEED, sprint: RUN_SPEED, crouchWalk: CROUCH_SPEED };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

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

  useEffect(() => {
    let drag: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      look.yaw -= dx * 0.006;
      look.camPitch = Math.min(1.15, Math.max(0.08, look.camPitch + dy * 0.004));
      look.eyePitch = Math.min(0.8, Math.max(-0.8, look.eyePitch - dy * 0.004));
    };
    const up = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
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

    const ahead = Number(input.up) - Number(input.down);
    const side = Number(input.right) - Number(input.left);
    // Camera-relative: "up" walks away from the camera, whichever way it faces.
    let dx = -Math.sin(look.yaw) * ahead + Math.cos(look.yaw) * side;
    let dz = -Math.cos(look.yaw) * ahead - Math.sin(look.yaw) * side;
    const len = Math.hypot(dx, dz);
    const [ox, oz] = [player.x, player.z];
    const frozen = s.chatOpen || s.mapOpen || (running && t < 0);
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
    const g = ref.current;
    if (g) {
      g.position.set(player.x, player.y, player.z);
      // Curled up, the body slides right under the desk; the player stays where they stood, which is clear of it.
      const desk = PLAN.items[player.cover];
      if (desk) deskAt.current = [desk.x, desk.z];
      tuck.current += ((desk ? 1 : 0) - tuck.current) * (1 - Math.exp(-dt * 10));
      const [ux, uz] = deskAt.current;
      g.position.x += (ux - player.x) * tuck.current;
      g.position.z += (uz - player.z) * tuck.current;
      g.rotation.y = shownHeading.current;
      g.visible = !first;
    }

    const strength = running && s.scenario.kind === "gempa" ? (shakingAt(t) ? 1 : aftershockAt(t) ? 0.45 : 0) : 0;
    const shake = strength * (0.05 + (s.scenario.intensity - 5) * 0.04) * (reducedMotion.current ? 0.2 : 1);
    const jitter = () => (Math.random() - 0.5) * shake;
    // Eased like the body's own crossfade, so ducking or standing up doesn't jolt the view.
    const eyeTo = player.cover >= 0 ? 0.5 : player.crouch ? 0.75 : player.seated ? 1.05 : 1.35;
    eyeHeight.current += (eyeTo - eyeHeight.current) * (1 - Math.exp(-dt * 10));
    const target = eye.current.set(player.x, player.y + eyeHeight.current, player.z);

    if (first) {
      camera.position.set(target.x + jitter(), target.y + jitter(), target.z + jitter());
      const c = Math.cos(look.eyePitch);
      camera.lookAt(
        target.x - Math.sin(look.yaw) * c,
        target.y + Math.sin(look.eyePitch),
        target.z - Math.cos(look.yaw) * c,
      );
    } else {
      // Something between camera and player: swing up a little first, then pull in; whatever still blocks the view fades.
      // Indoors the ceiling leaves no room to swing up, so the camera only pulls in.
      const pivot = pivotAt.current.set(target.x, target.y + 0.4, target.z);
      const maxLift = buildingAt(player.x, player.z) ? 0 : 0.45;
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
      camera.lookAt(target.x, target.y + 0.25, target.z);
    }

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

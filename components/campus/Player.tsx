"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3, type Group } from "three";
import { BUILDINGS, WARDEN, elevationAt, idx, isBlocked, tileAt, tileElevation } from "@/lib/campus";
import { DRILL_LIMIT_S, PLAYER_SPEED, QUAKE_SHAKE_S, waterLevel } from "@/lib/sim";
import type { Look } from "@/components/Character";
import Avatar from "./Avatar";
import { finishDrill, getState, input, look, openChat, player, resetInput, run, setState, useDrill } from "./drillStore";

const RADIUS = 0.3;
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
};
const CAM_DIST = 4.6;

const free = (x: number, z: number) =>
  [-RADIUS, RADIUS].every((ox) => [-RADIUS, RADIUS].every((oz) => !isBlocked(Math.floor(x + ox), Math.floor(z + oz))));

const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest("input, textarea, select") !== null;

function solid(x: number, y: number, z: number) {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  const c = tileAt(tx, tz);
  const ground = tileElevation(tx, tz);
  if (BUILDINGS[c]) return y < ground + BUILDINGS[c].floors * 1.5 + 1.2;
  if (c === "T") return y < ground + 2.8;
  if (c === "=") return y < ground + 0.95;
  // Roofs overhang by about half a tile: the space under the eaves is open, only the roof slab is solid.
  for (const [ox, oz] of [
    [-0.45, 0],
    [0.45, 0],
    [0, -0.45],
    [0, 0.45],
  ]) {
    const b = BUILDINGS[tileAt(Math.floor(x + ox), Math.floor(z + oz))];
    const eave = ground + (b?.floors ?? 0) * 1.5;
    if (b && y > eave && y < eave + 0.8) return true;
  }
  return false;
}

function clearReach(from: Vector3, yaw: number, pitch: number, dist: number) {
  const bx = Math.sin(yaw) * Math.cos(pitch);
  const bz = Math.cos(yaw) * Math.cos(pitch);
  const by = Math.sin(pitch);
  for (let d = 0.6; d <= dist; d += 0.15) {
    if (solid(from.x + bx * d, from.y + by * d, from.z + bz * d)) return d;
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

  useEffect(() => {
    reducedMotion.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onDown = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const k = KEYS[e.code];
      if (k) {
        input[k] = true;
        e.preventDefault();
      } else if (e.code === "KeyE" && getState().nearWarden && !getState().chatOpen) {
        openChat();
        e.preventDefault();
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
    const water = s.phase === "idle" ? 0 : waterLevel(s.scenario, running ? t : Infinity);
    const depth = water - elevationAt(player.x, player.z);
    const first = s.view === "first";

    const ahead = Number(input.up) - Number(input.down);
    const side = Number(input.right) - Number(input.left);
    // Camera-relative: "up" walks away from the camera, whichever way it faces.
    let dx = -Math.sin(look.yaw) * ahead + Math.cos(look.yaw) * side;
    let dz = -Math.cos(look.yaw) * ahead - Math.sin(look.yaw) * side;
    const len = Math.hypot(dx, dz);
    const frozen = s.chatOpen || (running && t < 0);
    player.crouch = input.crouch && !frozen;
    player.moving = len > 0 && !frozen && !player.crouch;
    player.wading = depth > 0.3;
    if (player.moving) {
      dx /= len;
      dz /= len;
      const speed = PLAYER_SPEED * (depth > 1 ? 0.2 : depth > 0.3 ? 0.55 : 1);
      const ox = player.x;
      const oz = player.z;
      // Small steps so a long frame can't carry the player through a wall corner.
      const steps = Math.ceil(dt / 0.04);
      const step = (speed * dt) / steps;
      for (let i = 0; i < steps; i++) {
        if (free(player.x + dx * step, player.z)) player.x += dx * step;
        if (free(player.x, player.z + dz * step)) player.z += dz * step;
      }
      player.heading = Math.atan2(dx, dz);
      if (running && t >= 0) run.walked += Math.hypot(player.x - ox, player.z - oz);
    } else if (first) {
      player.heading = look.yaw + Math.PI;
    }

    if (running && t >= 0) {
      const shaking = s.scenario.kind === "gempa" && t < QUAKE_SHAKE_S;
      if (shaking && player.crouch) run.coverS += dt;
      const inDebris = s.scenario.kind === "gempa" && !shaking && run.hazards.has(idx(Math.floor(player.x), Math.floor(player.z)));
      if (depth > 0.15 || inDebris) run.hazardS += dt;
      const atGoal = run.goals.some(([gx, gz]) => Math.hypot(gx + 0.5 - player.x, gz + 0.5 - player.z) < 1.6);
      if (atGoal && !shaking) finishDrill(true);
      else if (t > DRILL_LIMIT_S) finishDrill(false);
    }

    const ground = elevationAt(player.x, player.z);
    const g = ref.current;
    if (g) {
      g.position.set(player.x, ground, player.z);
      g.rotation.y = player.heading;
      g.visible = !first;
    }

    const shake =
      running && s.scenario.kind === "gempa" && t >= 0 && t < QUAKE_SHAKE_S
        ? (0.05 + (s.scenario.intensity - 5) * 0.04) * (reducedMotion.current ? 0.2 : 1)
        : 0;
    const jitter = () => (Math.random() - 0.5) * shake;
    const target = eye.current.set(player.x, ground + (player.crouch ? 0.55 : 1.05), player.z);

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
      let lift = 0;
      while (lift < 0.45 && clearReach(target, look.yaw, look.camPitch + lift, CAM_DIST) < CAM_DIST) lift += 0.05;
      camLift.current += (lift - camLift.current) * (1 - Math.exp(-dt * 6));
      const pitch = look.camPitch + camLift.current;
      const reach = Math.max(2.4, clearReach(target, look.yaw, pitch, CAM_DIST) - 0.3);
      camDist.current = reach < camDist.current ? reach : camDist.current + (reach - camDist.current) * (1 - Math.exp(-dt * 4));
      const d = camDist.current;
      const bx = Math.sin(look.yaw) * Math.cos(pitch);
      const bz = Math.cos(look.yaw) * Math.cos(pitch);
      const by = Math.sin(pitch);
      camera.position.set(target.x + bx * d + jitter(), target.y + 0.35 + by * d + jitter(), target.z + bz * d + jitter());
      camera.lookAt(target.x, target.y + 0.2, target.z);
    }

    const near = Math.hypot(WARDEN[0] + 0.5 - player.x, WARDEN[1] + 0.5 - player.z) < 3;
    if (near !== s.nearWarden) setState({ nearWarden: near });
  });

  return (
    <group ref={ref}>
      <Avatar
        look={character}
        name={name}
        self
        label={view === "third"}
        anim={() => (player.crouch ? "crouch" : player.moving ? (player.wading ? "walk" : "sprint") : "idle")}
      />
    </group>
  );
}

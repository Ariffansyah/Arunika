"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import { WARDEN, elevationAt, idx, isBlocked } from "@/lib/campus";
import { DRILL_LIMIT_S, PLAYER_SPEED, QUAKE_SHAKE_S, waterLevel } from "@/lib/sim";
import type { Look } from "@/components/Character";
import Avatar from "./Avatar";
import { finishDrill, getState, input, openChat, player, resetInput, run, setState } from "./drillStore";

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

const free = (x: number, z: number) =>
  [-RADIUS, RADIUS].every((ox) => [-RADIUS, RADIUS].every((oz) => !isBlocked(Math.floor(x + ox), Math.floor(z + oz))));

const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest("input, textarea, select") !== null;

export default function Player({ look, name }: { look: Look; name: string }) {
  const ref = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const reducedMotion = useRef(false);

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

  useFrame((_, delta) => {
    // Up to 0.25 s per frame keeps slow devices at full speed (the drill clock is wall time); bigger gaps are pauses.
    const dt = Math.min(delta, 0.25);
    const s = getState();
    const running = s.phase === "running";
    const t = running ? (Date.now() - s.startAt) / 1000 : 0;
    const water = s.phase === "idle" ? 0 : waterLevel(s.scenario, running ? t : Infinity);
    const depth = water - elevationAt(player.x, player.z);

    let dx = Number(input.right) - Number(input.left);
    let dz = Number(input.down) - Number(input.up);
    const len = Math.hypot(dx, dz);
    const frozen = s.chatOpen || (running && t < 0);
    player.crouch = input.crouch && !frozen;
    player.moving = Boolean(len) && !frozen && !player.crouch;
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

    const g = ref.current;
    if (g) {
      g.position.set(player.x, elevationAt(player.x, player.z), player.z);
      g.rotation.y = player.heading;
    }

    const shake =
      running && s.scenario.kind === "gempa" && t >= 0 && t < QUAKE_SHAKE_S
        ? (0.08 + (s.scenario.intensity - 5) * 0.06) * (reducedMotion.current ? 0.2 : 1)
        : 0;
    const y = elevationAt(player.x, player.z);
    camera.position.set(
      player.x + (Math.random() - 0.5) * shake,
      y + 11 + (Math.random() - 0.5) * shake,
      player.z + 9 + (Math.random() - 0.5) * shake,
    );
    camera.lookAt(player.x, y, player.z);

    const near = Math.hypot(WARDEN[0] + 0.5 - player.x, WARDEN[1] + 0.5 - player.z) < 3;
    if (near !== s.nearWarden) setState({ nearWarden: near });
  });

  return (
    <group ref={ref}>
      <Avatar
        look={look}
        name={name}
        self
        anim={() => (player.crouch ? "crouch" : player.moving ? (player.wading ? "walk" : "sprint") : "idle")}
      />
    </group>
  );
}

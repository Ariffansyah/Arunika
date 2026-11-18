"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ExtrudeGeometry, Shape, Vector2 } from "three";
import Html from "@/components/Html";
import "@/components/threeConsole";

export type MapSchool = { id: string; name: string; lat: number; lon: number; exposure: number; color: string };

// Equirectangular, centred on the archipelago: 1 unit per degree.
const LON0 = 118;
const LAT0 = -2;
const at = (lon: number, lat: number) => [lon - LON0, -(lat - LAT0)] as const;

function Land() {
  const [rings, setRings] = useState<[number, number][][] | null>(null);
  useEffect(() => {
    fetch("/data/indonesia.json")
      .then((r) => r.json())
      .then(setRings)
      .catch(() => setRings([]));
  }, []);
  const geometry = useMemo(() => {
    if (!rings?.length) return null;
    const shapes = rings.map((ring) => new Shape(ring.map(([lon, lat]) => new Vector2(lon - LON0, lat - LAT0))));
    return new ExtrudeGeometry(shapes, { depth: 0.25, bevelEnabled: false });
  }, [rings]);
  if (!geometry) return null;
  // Shapes are drawn in lon/lat (x/y); turning them flat maps latitude onto -z, matching `at`.
  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} receiveShadow>
      <meshStandardMaterial color="#3d5f8f" />
    </mesh>
  );
}

function Column({ s, selected, onSelect }: { s: MapSchool; selected: boolean; onSelect: () => void }) {
  const [x, z] = at(s.lon, s.lat);
  const h = 0.6 + (s.exposure / 100) * 5;
  const [hover, setHover] = useState(false);
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );
  return (
    <group position={[x, 0.25, z]}>
      <mesh
        position={[0, h / 2, 0]}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <cylinderGeometry args={[selected ? 0.42 : 0.32, selected ? 0.42 : 0.32, h, 16]} />
        <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={selected || hover ? 0.35 : 0.05} />
      </mesh>
      {(selected || hover) && (
        <Html position={[0, h + 0.7, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap rounded bg-malam/90 px-2 py-1 text-xs font-semibold text-pasir">{s.name}</span>
        </Html>
      )}
    </group>
  );
}

// The archipelago, with room for the columns at either end, is about twice as wide as it is deep; on a narrower canvas the camera backs off so it still fits.
const FIT_ASPECT = 2;
const pull = (aspect: number) => Math.min(2.2, Math.max(1, FIT_ASPECT / aspect));

function View() {
  const camera = useThree((s) => s.camera);
  const k = pull(useThree((s) => s.size.width / s.size.height));
  useLayoutEffect(() => {
    camera.position.set(0, 26 * k, 22 * k);
    camera.lookAt(0, 0, 0);
  }, [camera, k]);
  return <OrbitControls enablePan={false} minDistance={12} maxDistance={45 * k} minPolarAngle={0.2} maxPolarAngle={1.2} target={[0, 0, 0]} />;
}

export default function IndonesiaMap({
  schools,
  selected,
  onSelect,
}: {
  schools: MapSchool[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    // Flat: the navy sea and land keep the page's colours instead of being tone-mapped to grey.
    <Canvas flat shadows="percentage" dpr={[1, 2]} camera={{ position: [0, 26, 22], fov: 40 }} aria-label="Peta sekolah di Indonesia">
      <View />
      <color attach="background" args={["#071530"]} />
      <hemisphereLight args={["#d6e7ff", "#071530", 1.2]} />
      <directionalLight position={[20, 30, -10]} intensity={1.4} castShadow />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
        <planeGeometry args={[400, 300]} />
        {/* Unlit, so the sea stays the page's navy under any light. */}
        <meshBasicMaterial color="#0b1e3f" />
      </mesh>
      <Land />
      {schools.map((s) => (
        <Column key={s.id} s={s} selected={s.id === selected} onSelect={() => onSelect(s.id)} />
      ))}
    </Canvas>
  );
}

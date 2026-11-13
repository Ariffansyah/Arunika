"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { ExtrudeGeometry, Shape, Vector2 } from "three";

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
      <meshStandardMaterial color="#2c4466" />
    </mesh>
  );
}

function Column({ s, selected, onSelect }: { s: MapSchool; selected: boolean; onSelect: () => void }) {
  const [x, z] = at(s.lon, s.lat);
  const h = 0.6 + (s.exposure / 100) * 5;
  const [hover, setHover] = useState(false);
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
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 26, 22], fov: 40 }} aria-label="Peta 3D sekolah di Indonesia">
      <color attach="background" args={["#0d1828"]} />
      <hemisphereLight args={["#ffe2c2", "#0d1828", 1.1]} />
      <directionalLight position={[20, 30, -10]} color="#ffc48a" intensity={1.8} castShadow />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[80, 40]} />
        <meshStandardMaterial color="#132640" />
      </mesh>
      <Land />
      {schools.map((s) => (
        <Column key={s.id} s={s} selected={s.id === selected} onSelect={() => onSelect(s.id)} />
      ))}
      <OrbitControls
        enablePan={false}
        minDistance={12}
        maxDistance={45}
        minPolarAngle={0.2}
        maxPolarAngle={1.2}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

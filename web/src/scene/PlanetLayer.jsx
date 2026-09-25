import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glowTexture, planetTexture, ringTexture } from './textures.js';
import { PLANET_UNLOCKS } from '../state/planets.js';
import Appear from './wonders/Appear.jsx';

// Each planet keeps its real-world look so the system reads as a solar system.
const TRACK_COLOR = '#4a5070';
const ORBIT_SPEED = 0.12;

// `orbit` is the track radius, in real order from the sun: packed close for the
// rocky inner planets and opening up for the giants, with room for Earth's
// companion moon and Saturn's rings, and staying inside the asteroid belt.
const PLANET_SPECS = {
  mercury: { size: 0.18, atmosphere: '#c8b8a8', tilt: 0.03, orbit: 2.55 },
  venus: { size: 0.28, atmosphere: '#ffe0a0', tilt: 0.05, orbit: 3.35 },
  earth: { size: 0.3, atmosphere: '#7fb8ff', tilt: 0.41, moon: true, orbit: 4.15 },
  moon: { size: 0.14, atmosphere: '#cccccc', tilt: 0.1, orbit: 5.0 },
  mars: { size: 0.24, atmosphere: '#ff9a6b', tilt: 0.44, orbit: 5.8 },
  jupiter: { size: 0.55, atmosphere: '#e8c9a0', tilt: 0.05, orbit: 7.1 },
  saturn: { size: 0.45, atmosphere: '#f0dcae', tilt: 0.47, rings: true, orbit: 8.8 },
  uranus: { size: 0.32, atmosphere: '#b8f0f2', tilt: 1.7, rings: 'faint', orbit: 10.2 },
  neptune: { size: 0.34, atmosphere: '#6f9bff', tilt: 0.49, orbit: 11.5 },
};

function OrbitTrack({ radius, throttle }) {
  const materialRef = useRef(null);
  const geometry = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 128; i += 1) {
      const a = (i / 128) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [radius]);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    material.opacity = 0.2 * (0.35 + 0.65 * throttle.current);
  });

  return (
    <line geometry={geometry}>
      <lineBasicMaterial ref={materialRef} color={TRACK_COLOR} transparent opacity={0.2} depthWrite={false} />
    </line>
  );
}

function Rings({ size, faint }) {
  const texture = useMemo(() => ringTexture(), []);
  const geometry = useMemo(() => {
    const inner = size * 1.3;
    const outer = size * 2.3;
    const g = new THREE.RingGeometry(inner, outer, 128, 1);
    // Remap UVs so u runs radially from the inner to the outer edge of the strip texture.
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    return g;
  }, [size]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Unlit: the sun sits nearly in the ring plane, so a lit ring would render almost black. */}
      <meshBasicMaterial map={texture} color="#d8d0c0" transparent opacity={faint ? 0.25 : 0.9} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function Moon({ size }) {
  const ref = useRef(null);
  const texture = useMemo(() => planetTexture('moon'), []);
  useFrame((state) => {
    if (!ref.current) return;
    const a = state.clock.elapsedTime * 0.9;
    ref.current.position.set(Math.cos(a) * size * 2.2, Math.sin(a) * size * 0.4, Math.sin(a) * size * 2.2);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[size * 0.27, 24, 24]} />
      <meshStandardMaterial map={texture} roughness={1} />
    </mesh>
  );
}

function Planet({ index, running }) {
  const groupRef = useRef(null);
  const bodyRef = useRef(null);
  const haloRef = useRef(null);
  const { kind } = PLANET_UNLOCKS[index];
  const spec = PLANET_SPECS[kind];
  const radius = spec.orbit;
  const texture = useMemo(() => planetTexture(kind), [kind]);
  const glow = useMemo(() => glowTexture(), []);
  // Orbital angle and spin accumulate so the system can glide to a halt when
  // Claude is idle or waiting, and resume from where it stopped.
  const motion = useRef({ angle: (index / PLANET_UNLOCKS.length) * Math.PI * 2, spin: 0 });
  const throttle = useRef(running ? 1 : 0);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const m = motion.current;
    throttle.current += ((running ? 1 : 0) - throttle.current) * Math.min(1, delta * 1.5);
    m.angle += delta * ORBIT_SPEED * throttle.current;
    m.spin += delta * (kind === 'jupiter' || kind === 'saturn' ? 0.5 : 0.25) * (0.15 + 0.85 * throttle.current);
    groupRef.current.position.set(Math.cos(m.angle) * radius, 0, Math.sin(m.angle) * radius);
    if (bodyRef.current) bodyRef.current.rotation.y = m.spin;
    if (haloRef.current) haloRef.current.material.opacity = 0.3 * (0.25 + 0.75 * throttle.current);
  });

  return (
    <>
      <OrbitTrack radius={radius} throttle={throttle} />
      <group ref={groupRef}>
        <Appear>
          <sprite ref={haloRef} scale={spec.size * 3.4}>
            <spriteMaterial map={glow} color={spec.atmosphere} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
          <group rotation={[0, 0, spec.tilt]}>
            <mesh ref={bodyRef}>
              <sphereGeometry args={[spec.size, 48, 48]} />
              <meshStandardMaterial map={texture} roughness={0.9} metalness={0} />
            </mesh>
            {spec.rings && <Rings size={spec.size} faint={spec.rings === 'faint'} />}
          </group>
          {spec.moon && <Moon size={spec.size} />}
        </Appear>
      </group>
    </>
  );
}

// `count` planets are lit, in PLANET_UNLOCKS order.
export default function PlanetLayer({ count, running = true }) {
  if (!count) return null;

  return (
    <group>
      {PLANET_UNLOCKS.slice(0, count).map(({ kind }, index) => (
        <Planet key={kind} index={index} running={running} />
      ))}
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PLANET_KINDS, glowTexture, planetTexture, ringTexture } from './textures.js';

// Status is shown by the orbit track and the atmosphere glow; the planet itself
// keeps its real-world look so the system reads as a solar system.
const STATUS_COLOR = {
  pending: '#4a5070',
  in_progress: '#5fb0ff',
  completed: '#7dffb0',
};

const PLANET_SPECS = {
  earth: { size: 0.3, atmosphere: '#7fb8ff', tilt: 0.41, moon: true },
  mars: { size: 0.24, atmosphere: '#ff9a6b', tilt: 0.44 },
  jupiter: { size: 0.55, atmosphere: '#e8c9a0', tilt: 0.05 },
  saturn: { size: 0.45, atmosphere: '#f0dcae', tilt: 0.47, rings: true },
  neptune: { size: 0.34, atmosphere: '#6f9bff', tilt: 0.49 },
  venus: { size: 0.28, atmosphere: '#ffe0a0', tilt: 0.05 },
  uranus: { size: 0.32, atmosphere: '#b8f0f2', tilt: 1.7, rings: 'faint' },
  moon: { size: 0.2, atmosphere: '#cccccc', tilt: 0.1 },
};

function orbitRadius(index) {
  return 3 + index * 1.25;
}

function OrbitTrack({ radius, status, dimmed }) {
  const geometry = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 128; i += 1) {
      const a = (i / 128) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [radius]);

  const opacity = (status === 'in_progress' ? 0.55 : status === 'completed' ? 0.35 : 0.12) * (dimmed ? 0.35 : 1);
  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={STATUS_COLOR[status] ?? STATUS_COLOR.pending} transparent opacity={opacity} depthWrite={false} />
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

function Planet({ index, total, status, running }) {
  const groupRef = useRef(null);
  const bodyRef = useRef(null);
  const haloRef = useRef(null);
  const kind = PLANET_KINDS[index % PLANET_KINDS.length];
  const spec = PLANET_SPECS[kind];
  const radius = orbitRadius(index);
  const speed = status === 'in_progress' ? 0.35 : status === 'completed' ? 0.12 : 0;
  const texture = useMemo(() => planetTexture(kind), [kind]);
  const glow = useMemo(() => glowTexture(), []);
  const pending = status === 'pending';
  const haloColor = status === 'pending' ? spec.atmosphere : STATUS_COLOR[status];
  // Orbital angle and spin accumulate so the system can glide to a halt when
  // Claude is idle or waiting, and resume from where it stopped.
  const motion = useRef({ angle: (index / total) * Math.PI * 2, spin: 0, throttle: running ? 1 : 0 });

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const m = motion.current;
    m.throttle += ((running ? 1 : 0) - m.throttle) * Math.min(1, delta * 1.5);
    m.angle += delta * speed * m.throttle;
    m.spin += delta * (kind === 'jupiter' || kind === 'saturn' ? 0.5 : 0.25) * (0.15 + 0.85 * m.throttle);
    groupRef.current.position.set(Math.cos(m.angle) * radius, 0, Math.sin(m.angle) * radius);
    if (bodyRef.current) bodyRef.current.rotation.y = m.spin;
    if (haloRef.current) {
      const pulse = status === 'in_progress' && running ? 1 + Math.sin(t * 3) * 0.12 : 1;
      haloRef.current.scale.setScalar(spec.size * 3.4 * pulse);
      const base = status === 'in_progress' ? 0.55 : status === 'completed' ? 0.35 : 0.12;
      haloRef.current.material.opacity = base * (0.25 + 0.75 * m.throttle);
    }
  });

  return (
    <>
      <OrbitTrack radius={radius} status={status} dimmed={!running} />
      <group ref={groupRef}>
        <sprite ref={haloRef} scale={spec.size * 4.2}>
          <spriteMaterial map={glow} color={haloColor} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <group rotation={[0, 0, spec.tilt]}>
          <mesh ref={bodyRef}>
            <sphereGeometry args={[spec.size, 48, 48]} />
            <meshStandardMaterial
              map={texture}
              color={pending ? '#a3a8c0' : '#ffffff'}
              roughness={0.9}
              metalness={0}
              emissive={STATUS_COLOR[status] ?? STATUS_COLOR.pending}
              emissiveIntensity={status === 'in_progress' ? 0.08 : 0}
            />
          </mesh>
          {spec.rings && <Rings size={spec.size} faint={spec.rings === 'faint'} />}
        </group>
        {spec.moon && <Moon size={spec.size} />}
      </group>
    </>
  );
}

export default function PlanetLayer({ todos, running = true }) {
  if (!todos || todos.length === 0) return null;

  return (
    <group>
      {todos.map((todo, index) => (
        <Planet key={todo.id} index={index} total={todos.length} status={todo.status} running={running} />
      ))}
    </group>
  );
}

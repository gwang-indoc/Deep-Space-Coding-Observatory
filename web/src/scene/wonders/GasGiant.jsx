import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glowTexture, planetTexture } from '../textures.js';

const ORBIT = 17;
const SIZE = 1.1;
const MOONS = [
  { r: 1.9, speed: 1.1, size: 0.09, tint: '#e8d27a' },
  { r: 2.4, speed: 0.8, size: 0.08, tint: '#d8d8d0' },
  { r: 3.0, speed: 0.55, size: 0.12, tint: '#b8aa98' },
  { r: 3.8, speed: 0.35, size: 0.11, tint: '#8a8078' },
];

// A far-out Jupiter-class giant with four Galilean-style moons.
export default function GasGiant() {
  const groupRef = useRef(null);
  const bodyRef = useRef(null);
  const moonRefs = useRef([]);
  const angle = useRef(2.2);
  const texture = useMemo(() => planetTexture('jupiter'), []);
  const moonTexture = useMemo(() => planetTexture('moon'), []);
  const glow = useMemo(() => glowTexture(), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    angle.current += delta * 0.03;
    groupRef.current.position.set(Math.cos(angle.current) * ORBIT, -0.6, Math.sin(angle.current) * ORBIT);
    bodyRef.current.rotation.y = t * 0.4;
    moonRefs.current.forEach((moon, i) => {
      if (!moon) return;
      const m = MOONS[i];
      const a = t * m.speed + i * 1.7;
      moon.position.set(Math.cos(a) * m.r, Math.sin(a) * m.r * 0.08, Math.sin(a) * m.r);
    });
  });

  return (
    <group ref={groupRef}>
      <sprite scale={SIZE * 3.2}>
        <spriteMaterial map={glow} color="#ffcf9a" transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh ref={bodyRef} rotation={[0, 0, 0.05]}>
        <sphereGeometry args={[SIZE, 64, 64]} />
        <meshStandardMaterial map={texture} color="#ffe2cc" roughness={0.9} />
      </mesh>
      {MOONS.map((m, i) => (
        <mesh key={i} ref={(el) => (moonRefs.current[i] = el)}>
          <sphereGeometry args={[m.size, 20, 20]} />
          <meshStandardMaterial map={moonTexture} color={m.tint} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

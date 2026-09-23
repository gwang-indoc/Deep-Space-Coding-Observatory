import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { selectActiveRadarPings, RADAR_TTL_MS } from '../state/orbitReducer.js';

function Ping({ ping }) {
  const meshRef = useRef(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const progress = Math.min(1, (Date.now() - ping.startedAt) / RADAR_TTL_MS);
    meshRef.current.scale.setScalar(1 + progress * 6);
    meshRef.current.material.opacity = 1 - progress;
  });

  return (
    <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1, 1.05, 32]} />
      <meshBasicMaterial color="#5fb0ff" transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function RadarPing({ radarPings }) {
  const now = Date.now();
  const active = selectActiveRadarPings({ radarPings }, now);

  return (
    <group>
      {active.map((ping) => (
        <Ping key={ping.id} ping={ping} />
      ))}
    </group>
  );
}

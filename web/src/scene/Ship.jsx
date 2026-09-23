import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { selectActiveShips, SHIP_TTL_MS } from '../state/orbitReducer.js';

function ShipMesh({ ship }) {
  const meshRef = useRef(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const progress = Math.min(1, Math.max(0, (Date.now() - ship.startedAt) / SHIP_TTL_MS));
    const angle = progress * Math.PI * 2;
    const radius = 4 + progress * 4;
    meshRef.current.position.set(Math.cos(angle) * radius, 0.1, Math.sin(angle) * radius);
  });

  return (
    <mesh ref={meshRef}>
      <coneGeometry args={[0.12, 0.4, 8]} />
      <meshStandardMaterial color={ship.kind === 'tests' ? '#7dffb0' : '#ffd479'} />
    </mesh>
  );
}

function TestResultRing({ testResultRing }) {
  if (!testResultRing) return null;
  const total = testResultRing.passed + testResultRing.failed;
  if (total === 0) return null;

  return (
    <group>
      {Array.from({ length: total }).map((_, index) => {
        const angle = (index / total) * Math.PI * 2;
        const passed = index < testResultRing.passed;
        return (
          <mesh key={index} position={[Math.cos(angle) * 8.5, 0, Math.sin(angle) * 8.5]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color={passed ? '#7dffb0' : '#ff6b6b'} emissive={passed ? '#3d8f61' : '#8f2d2d'} emissiveIntensity={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function Ship({ ships, testResultRing }) {
  const now = Date.now();
  const active = selectActiveShips({ ships }, now);

  return (
    <group>
      {active.map((ship) => (
        <ShipMesh key={ship.id} ship={ship} />
      ))}
      <TestResultRing testResultRing={testResultRing} />
    </group>
  );
}

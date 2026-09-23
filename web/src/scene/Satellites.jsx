import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

function Satellite({ index, total, blinkCount }) {
  const meshRef = useRef(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const angle = (index / Math.max(total, 1)) * Math.PI * 2 + state.clock.elapsedTime * 0.5;
    const radius = 6.5;
    meshRef.current.position.set(Math.cos(angle) * radius, Math.sin(state.clock.elapsedTime + index) * 0.3, Math.sin(angle) * radius);
    const blink = blinkCount > 0 ? 1 + Math.sin(state.clock.elapsedTime * 6) * 0.3 : 1;
    meshRef.current.scale.setScalar(blink);
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.15, 0.15, 0.15]} />
      <meshStandardMaterial color="#cbd5f5" emissive="#8ea2c6" emissiveIntensity={0.4} />
    </mesh>
  );
}

export default function Satellites({ satellites }) {
  if (!satellites || satellites.length === 0) return null;

  return (
    <group>
      {satellites.map((satellite, index) => (
        <Satellite key={satellite.file} index={index} total={satellites.length} blinkCount={satellite.blinkCount} />
      ))}
    </group>
  );
}

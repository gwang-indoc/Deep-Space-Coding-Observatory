import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { selectNebulaVisible } from '../state/orbitReducer.js';

export default function Nebula({ waitingSince }) {
  const meshRef = useRef(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const visible = selectNebulaVisible({ waitingSince }, Date.now());
    meshRef.current.visible = visible;
    if (visible) {
      meshRef.current.rotation.z = state.clock.elapsedTime * 0.02;
      meshRef.current.material.opacity = 0.15 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -15]}>
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial color="#5b3a8f" transparent opacity={0.15} />
    </mesh>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const STAR_COUNT = 400;

export default function IdleUniverse() {
  const pointsRef = useRef(null);

  const positions = useMemo(() => {
    const array = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      array[i * 3] = (Math.random() - 0.5) * 60;
      array[i * 3 + 1] = (Math.random() - 0.5) * 60;
      array[i * 3 + 2] = (Math.random() - 0.5) * 60 - 10;
    }
    return array;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.01;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#8ea2c6" size={0.05} sizeAttenuation />
    </points>
  );
}

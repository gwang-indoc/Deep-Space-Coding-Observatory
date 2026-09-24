import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

const APPEAR_S = 3;

// Grows its children from nothing when first mounted, so a newly unlocked body
// visibly "arrives" instead of popping in.
export default function Appear({ position, rotation, children }) {
  const ref = useRef(null);
  const age = useRef(0);

  useFrame((_, delta) => {
    if (!ref.current || age.current >= APPEAR_S) return;
    age.current = Math.min(APPEAR_S, age.current + delta);
    const t = age.current / APPEAR_S;
    ref.current.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - t, 3)));
  });

  return (
    <group ref={ref} position={position} rotation={rotation} scale={0.001}>
      {children}
    </group>
  );
}

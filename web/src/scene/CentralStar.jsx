import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { selectMissionCompleteFlashVisible } from '../state/orbitReducer.js';

export default function CentralStar({ missionActive, lastCompletedAt }) {
  const meshRef = useRef(null);
  const [flashing, setFlashing] = useState(false);

  useFrame((state) => {
    if (!meshRef.current) return;
    const flashVisible = selectMissionCompleteFlashVisible({ lastCompletedAt }, Date.now());
    if (flashVisible !== flashing) setFlashing(flashVisible);

    const pulse = flashVisible
      ? 1 + Math.max(0, 1 - (Date.now() - lastCompletedAt) / 2500) * 1.5
      : missionActive
        ? 1 + Math.sin(state.clock.elapsedTime * 2) * 0.08
        : 1;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.2, 32, 32]} />
      <meshStandardMaterial
        color={flashing ? '#ffffff' : missionActive ? '#ffcf7a' : '#3a3f55'}
        emissive={flashing ? '#ffe9c2' : missionActive ? '#ff9f43' : '#101223'}
        emissiveIntensity={flashing ? 2.2 : missionActive ? 0.8 : 0.15}
      />
      {flashing && (
        <Html center distanceFactor={10}>
          <div style={{ color: '#ffe9c2', fontFamily: 'monospace', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
            MISSION COMPLETE
          </div>
        </Html>
      )}
    </mesh>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glowTexture, remnantTexture } from '../textures.js';

// The expanding, filamentary shell left by a supernova, with the surviving
// neutron star flickering at its centre.
export default function SupernovaRemnant() {
  const shellRef = useRef(null);
  const innerRef = useRef(null);
  const texture = useMemo(() => remnantTexture(), []);
  const glow = useMemo(() => glowTexture(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const grow = 1 + Math.min(0.25, t * 0.0015);
    if (shellRef.current) {
      shellRef.current.scale.set(22 * grow, 22 * grow, 1);
      shellRef.current.material.rotation = t * 0.004;
    }
    if (innerRef.current) innerRef.current.material.opacity = 0.6 + Math.sin(t * 9) * 0.25;
  });

  return (
    <group>
      <sprite ref={shellRef} scale={22}>
        <spriteMaterial map={texture} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite ref={innerRef} scale={1.6}>
        <spriteMaterial map={glow} color="#bfe0ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  );
}

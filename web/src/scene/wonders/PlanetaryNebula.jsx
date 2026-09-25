import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glowTexture, planetaryNebulaTexture } from '../textures.js';

const SIZE = 13;

// The shell a dying Sun-like star has puffed off, lit from inside by the white
// dwarf left at its centre. It breathes slowly; nothing here is violent.
export default function PlanetaryNebula() {
  const shellRef = useRef(null);
  const dwarfRef = useRef(null);
  const texture = useMemo(() => planetaryNebulaTexture(), []);
  const glow = useMemo(() => glowTexture(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (shellRef.current) {
      const breathe = 1 + Math.sin(t * 0.3) * 0.03;
      shellRef.current.scale.set(SIZE * breathe, SIZE * breathe, 1);
      shellRef.current.material.rotation = t * 0.006;
      shellRef.current.material.opacity = 0.6 + Math.sin(t * 0.3) * 0.06;
    }
    if (dwarfRef.current) dwarfRef.current.material.opacity = 0.85 + Math.sin(t * 1.7) * 0.1;
  });

  return (
    <group>
      <sprite ref={shellRef} scale={SIZE}>
        <spriteMaterial map={texture} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite ref={dwarfRef} scale={1.3}>
        <spriteMaterial map={glow} color="#e8f0ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  );
}

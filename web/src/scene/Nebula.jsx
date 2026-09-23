import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { selectNebulaVisible } from '../state/orbitReducer.js';
import { nebulaTexture } from './textures.js';

// While Claude waits for the user, a violet nebula drifts in behind the system.
const LAYERS = [
  { seed: 201, colors: ['#8a3fd1', '#5b3a8f', '#c04fa0'], position: [-4, 2, -18], scale: 34, spin: 0.015 },
  { seed: 211, colors: ['#3f5fd1', '#7a3fd1', '#2f8fbf'], position: [6, -3, -22], scale: 40, spin: -0.01 },
];

export default function Nebula({ waitingSince }) {
  const groupRef = useRef(null);
  const fade = useRef(0);
  const textures = useMemo(() => LAYERS.map((layer) => nebulaTexture(layer.seed, layer.colors)), []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const visible = selectNebulaVisible({ waitingSince }, Date.now());
    fade.current += ((visible ? 1 : 0) - fade.current) * Math.min(1, delta * 1.5);
    groupRef.current.visible = fade.current > 0.01;
    groupRef.current.children.forEach((sprite, i) => {
      sprite.material.rotation = state.clock.elapsedTime * LAYERS[i].spin;
      sprite.material.opacity = fade.current * (0.75 + Math.sin(state.clock.elapsedTime * 0.5 + i) * 0.2);
    });
  });

  return (
    <group ref={groupRef}>
      {LAYERS.map((layer, i) => (
        <sprite key={layer.seed} position={layer.position} scale={[layer.scale, layer.scale * 0.75, 1]}>
          <spriteMaterial map={textures[i]} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGlowPointsMaterial } from '../glowPoints.js';
import { glowTexture } from '../textures.js';

const STARS = 9000;
const RADIUS = 14;
const ARMS = 2;

// A distant two-armed spiral galaxy: warm core, blue star-forming arms.
export default function Galaxy() {
  const ref = useRef(null);
  const material = useMemo(() => createGlowPointsMaterial({ twinkle: 0.2 }), []);
  const glow = useMemo(() => glowTexture(), []);

  const geometry = useMemo(() => {
    const positions = new Float32Array(STARS * 3);
    const colors = new Float32Array(STARS * 3);
    const sizes = new Float32Array(STARS);
    const alphas = new Float32Array(STARS);
    const phases = new Float32Array(STARS);
    const core = new THREE.Color('#ffe2b0');
    const arm = new THREE.Color('#8fb4ff');
    const pink = new THREE.Color('#ff9ad0');
    const c = new THREE.Color();
    for (let i = 0; i < STARS; i += 1) {
      const d = Math.pow(Math.random(), 1.6);
      const r = d * RADIUS;
      const armAngle = ((i % ARMS) / ARMS) * Math.PI * 2;
      const swirl = r * 0.42;
      const scatter = (Math.random() - 0.5) * (0.35 + d * 0.9);
      const a = armAngle + swirl + scatter;
      positions.set([Math.cos(a) * r, (Math.random() - 0.5) * (1.2 - d) * 0.8, Math.sin(a) * r], i * 3);
      c.copy(core).lerp(arm, Math.min(1, d * 1.6));
      if (Math.random() < 0.04 && d > 0.3) c.copy(pink);
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 0.25 + Math.random() * 0.5;
      alphas[i] = 0.25 + (1 - d) * 0.5;
      phases[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    return g;
  }, []);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });

  return (
    <group rotation={[1.05, 0, 0.35]}>
      <group ref={ref}>
        <points geometry={geometry} material={material} />
      </group>
      <sprite scale={7}>
        <spriteMaterial map={glow} color="#ffd9a0" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  );
}

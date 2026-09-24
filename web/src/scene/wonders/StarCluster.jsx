import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGlowPointsMaterial } from '../glowPoints.js';
import { glowTexture, nebulaTexture } from '../textures.js';

const FAINT_STARS = 140;
const RADIUS = 5;

// The handful of bright members that give the cluster its shape, like the
// Pleiades' Seven Sisters: [x, y, z, size].
const BRIGHT = [
  [0, 0.4, 0, 2.4],
  [-1.8, 1.1, 0.6, 1.9],
  [1.5, 1.6, -0.4, 2.0],
  [2.6, -0.3, 0.8, 1.7],
  [-0.9, -1.4, -0.7, 1.8],
  [0.8, -0.9, 1.4, 1.5],
  [-2.9, -0.2, -1.1, 1.6],
];

// Roughly Gaussian scatter so members crowd toward the middle.
function gaussian() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

// A young open cluster of hot blue-white stars in a faint blue reflection
// nebula. Deliberately calm: no flicker, only a slow breathing glow.
export default function StarCluster() {
  const ref = useRef(null);
  const glowRefs = useRef([]);
  const hazeRef = useRef(null);
  const material = useMemo(() => createGlowPointsMaterial({ twinkle: 0.05 }), []);
  const glow = useMemo(() => glowTexture(), []);
  const haze = useMemo(() => nebulaTexture(307, ['#35508f', '#5673b0', '#2a3f73']), []);

  const geometry = useMemo(() => {
    const count = FAINT_STARS + BRIGHT.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const phases = new Float32Array(count);
    const hot = new THREE.Color('#bcd2ff');
    const white = new THREE.Color('#f4f6ff');
    const c = new THREE.Color();
    for (let i = 0; i < FAINT_STARS; i += 1) {
      positions.set([gaussian() * RADIUS, gaussian() * RADIUS * 0.7, gaussian() * RADIUS], i * 3);
      c.copy(hot).lerp(white, Math.random());
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 0.3 + Math.random() * 0.45;
      alphas[i] = 0.35 + Math.random() * 0.4;
      phases[i] = Math.random();
    }
    BRIGHT.forEach(([x, y, z, size], j) => {
      const i = FAINT_STARS + j;
      positions.set([x, y, z], i * 3);
      colors.set([white.r, white.g, white.b], i * 3);
      sizes[i] = size * 1.3;
      alphas[i] = 1;
      phases[i] = Math.random();
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    return g;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    if (ref.current) ref.current.rotation.y = t * 0.01;
    glowRefs.current.forEach((sprite, i) => {
      if (sprite) sprite.material.opacity = 0.35 + Math.sin(t * 0.4 + i * 0.9) * 0.06;
    });
    if (hazeRef.current) hazeRef.current.material.opacity = 0.3 + Math.sin(t * 0.25) * 0.05;
  });

  return (
    <group>
      <sprite ref={hazeRef} scale={[22, 17, 1]}>
        <spriteMaterial map={haze} transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <group ref={ref}>
        <points geometry={geometry} material={material} />
        {BRIGHT.map(([x, y, z, size], i) => (
          <sprite key={i} ref={(el) => (glowRefs.current[i] = el)} position={[x, y, z]} scale={size * 0.9}>
            <spriteMaterial map={glow} color="#a8c4ff" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
        ))}
      </group>
    </group>
  );
}

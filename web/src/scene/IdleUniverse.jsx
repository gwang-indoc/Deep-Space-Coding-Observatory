import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGlowPointsMaterial } from './glowPoints.js';
import { nebulaTexture } from './textures.js';

const STAR_COUNT = 3500;

// Real star colors by spectral class, weighted toward the common white/yellow ones.
const STAR_COLORS = ['#9bb0ff', '#aabfff', '#cad7ff', '#f8f7ff', '#fff4ea', '#ffd2a1', '#ffcc6f', '#ffb56c'];
const STAR_WEIGHTS = [0.05, 0.1, 0.15, 0.25, 0.2, 0.12, 0.08, 0.05];

function pickColor(rand) {
  let r = rand;
  for (let i = 0; i < STAR_WEIGHTS.length; i += 1) {
    r -= STAR_WEIGHTS[i];
    if (r <= 0) return STAR_COLORS[i];
  }
  return STAR_COLORS[3];
}

function Starfield() {
  const pointsRef = useRef(null);
  const material = useMemo(() => createGlowPointsMaterial({ twinkle: 0.35 }), []);

  const geometry = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const alphas = new Float32Array(STAR_COUNT);
    const phases = new Float32Array(STAR_COUNT);
    const color = new THREE.Color();

    for (let i = 0; i < STAR_COUNT; i += 1) {
      // Half the stars concentrate in a tilted galactic band, like the Milky Way.
      const inBand = i % 2 === 0;
      const theta = Math.random() * Math.PI * 2;
      const phi = inBand
        ? Math.PI / 2 + (Math.random() - 0.5) * 0.35 * (Math.random() + 0.2)
        : Math.acos(2 * Math.random() - 1);
      const radius = 60 + Math.random() * 60;
      const v = new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);
      v.applyAxisAngle(new THREE.Vector3(1, 0, 0.4).normalize(), 0.9);
      positions.set([v.x, v.y, v.z], i * 3);

      color.set(pickColor(Math.random()));
      colors.set([color.r, color.g, color.b], i * 3);
      const bright = Math.random() < 0.03;
      sizes[i] = bright ? 1.4 + Math.random() * 1.2 : 0.3 + Math.random() * 0.6;
      alphas[i] = bright ? 1 : 0.35 + Math.random() * 0.55;
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
    if (pointsRef.current) pointsRef.current.rotation.y = state.clock.elapsedTime * 0.004;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

// Faint colored clouds far behind everything, giving the sky depth.
const BACKDROP_CLOUDS = [
  { seed: 5, colors: ['#3b2a78', '#1f4f8f', '#6a2f7a'], position: [-45, 18, -70], scale: 70, opacity: 0.4 },
  { seed: 9, colors: ['#1c5a7a', '#2b3f8f', '#154060'], position: [50, -12, -80], scale: 80, opacity: 0.32 },
  { seed: 13, colors: ['#7a2f4f', '#4a2a78', '#8f4a2b'], position: [10, 35, -90], scale: 60, opacity: 0.3 },
];

function BackdropCloud({ seed, colors, position, scale, opacity }) {
  const texture = useMemo(() => nebulaTexture(seed, colors), [seed, colors]);
  return (
    <sprite position={position} scale={[scale, scale * 0.7, 1]}>
      <spriteMaterial map={texture} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

export default function IdleUniverse() {
  return (
    <group>
      {BACKDROP_CLOUDS.map((cloud) => (
        <BackdropCloud key={cloud.seed} {...cloud} />
      ))}
      <Starfield />
    </group>
  );
}

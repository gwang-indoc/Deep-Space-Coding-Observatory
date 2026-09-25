import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGlowPointsMaterial } from '../glowPoints.js';
import { glowTexture } from '../textures.js';

const DISK_STARS = 4000;
const TAIL_STARS = 2200;
const BRIDGE_STARS = 500;
const DISK_RADIUS = 5;

// Two spirals in the middle of a close pass, like the Mice or the Antennae:
// each disk is pulled out of shape and flings a long curved tail of stars
// behind it, with a thin bridge of new pink star-forming knots between them.
const GALAXIES = [
  { center: new THREE.Vector3(-6.5, 0, 0), tilt: new THREE.Euler(1.2, 0, 0.3), tailSide: -1 },
  { center: new THREE.Vector3(6.5, 1.2, 1), tilt: new THREE.Euler(0.5, 0.6, -0.4), tailSide: 1 },
];

function gaussian() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

export default function CollidingGalaxies() {
  const ref = useRef(null);
  const material = useMemo(() => createGlowPointsMaterial({ twinkle: 0.15 }), []);
  const glow = useMemo(() => glowTexture(), []);

  const geometry = useMemo(() => {
    const count = (DISK_STARS + TAIL_STARS) * GALAXIES.length + BRIDGE_STARS;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const phases = new Float32Array(count);
    const core = new THREE.Color('#ffe0b0');
    const arm = new THREE.Color('#9ab8ff');
    const pink = new THREE.Color('#ff8ec8');
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    let i = 0;
    const add = (point, color, size, alpha) => {
      positions.set([point.x, point.y, point.z], i * 3);
      colors.set([color.r, color.g, color.b], i * 3);
      sizes[i] = size;
      alphas[i] = alpha;
      phases[i] = Math.random();
      i += 1;
    };

    GALAXIES.forEach(({ center, tilt, tailSide }) => {
      for (let n = 0; n < DISK_STARS; n += 1) {
        const d = Math.pow(Math.random(), 1.5);
        const r = d * DISK_RADIUS;
        const a = (n % 2) * Math.PI + r * 0.7 + gaussian() * (0.3 + d * 0.6);
        // Tidal stretch: the disk is drawn out toward its partner.
        v.set(Math.cos(a) * r * (1 + d * 0.35), gaussian() * (1 - d) * 0.35, Math.sin(a) * r);
        v.applyEuler(tilt).add(center);
        c.copy(core).lerp(arm, Math.min(1, d * 1.5));
        add(v, c, 0.25 + Math.random() * 0.45, 0.3 + (1 - d) * 0.5);
      }
      // The tail is flung out sideways, away from the partner, and curls as it
      // thins out, like the Antennae's long arcs.
      for (let n = 0; n < TAIL_STARS; n += 1) {
        const s = Math.pow(Math.random(), 0.8);
        const spread = 0.3 + s * 0.9;
        v.set(
          tailSide * (DISK_RADIUS * 0.7 + s * 15) + gaussian() * spread,
          -tailSide * s * s * 9 + gaussian() * spread,
          gaussian() * spread,
        ).add(center);
        c.copy(arm).lerp(core, Math.random() * 0.3);
        add(v, c, 0.2 + Math.random() * 0.35, 0.18 + (1 - s) * 0.35);
      }
    });

    const [a, b] = GALAXIES;
    for (let n = 0; n < BRIDGE_STARS; n += 1) {
      const t = Math.random();
      v.lerpVectors(a.center, b.center, t);
      v.y += Math.sin(t * Math.PI) * 1.4 + gaussian() * 0.4;
      v.x += gaussian() * 0.5;
      v.z += gaussian() * 0.5;
      const knot = Math.random() < 0.25;
      add(v, knot ? pink : arm, knot ? 0.6 : 0.25, knot ? 0.8 : 0.35);
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
    if (ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.02) * 0.4;
  });

  return (
    // Turned side-on to the Sun, so the tails stretch across the sky instead of
    // pointing at the camera.
    <group rotation-y={Math.PI / 2} scale={1.4}>
      <group rotation={[0.35, 0, 0.15]}>
        <group ref={ref}>
          <points geometry={geometry} material={material} />
          {GALAXIES.map(({ center }, n) => (
            <sprite key={n} position={center.toArray()} scale={4.5}>
              <spriteMaterial map={glow} color="#ffd9a0" transparent opacity={0.65} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </sprite>
          ))}
        </group>
      </group>
    </group>
  );
}

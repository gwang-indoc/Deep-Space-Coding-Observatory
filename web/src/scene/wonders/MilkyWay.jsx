import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGlowPointsMaterial } from '../glowPoints.js';
import { nebulaTexture } from '../textures.js';

const STARS = 24000;
const INNER = 140;
const DEPTH = 22;
const HAZE_RADIUS = 150;
const HAZE_COUNT = 20;
const FADE_S = 8;
// The camera looks down on the planets, so the sky it sees is the band just
// below the horizon. A shallow tilt keeps half the Milky Way arching across the
// top of the view as the camera circles, and puts the galactic centre at the
// band's lowest point, where it rises furthest into the picture.
const TILT_AXIS = new THREE.Vector3(1, 0, 0);
const TILT = -0.32;
const BULGE_AT = Math.PI;

function gaussian() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

// How close a longitude is to the galactic centre, 1 at the centre fading to 0.
function bulgeWeight(theta) {
  const d = Math.atan2(Math.sin(theta - BULGE_AT), Math.cos(theta - BULGE_AT));
  return Math.exp(-(d * d) / 0.35);
}

function onBand(radius, theta, latitude) {
  const v = new THREE.Vector3().setFromSphericalCoords(radius, Math.PI / 2 + latitude, theta);
  return v.applyAxisAngle(TILT_AXIS, TILT);
}

// The Milky Way seen from inside: a band of faint stars circling the whole sky,
// swelling and warming toward the galactic centre, split there by a dark dust
// lane. Unlike the other wonders it is not somewhere in the sky, it is the sky,
// so it fades in rather than growing from a point.
export default function MilkyWay() {
  const ref = useRef(null);
  const hazeRefs = useRef([]);
  const age = useRef(0);
  const material = useMemo(() => {
    const m = createGlowPointsMaterial({ twinkle: 0.08 });
    m.uniforms.uOpacity.value = 0;
    return m;
  }, []);
  const warmHaze = useMemo(() => nebulaTexture(411, ['#7a6a5a', '#8a7a68', '#5e5a70']), []);
  const coolHaze = useMemo(() => nebulaTexture(419, ['#4a5a82', '#5c6a90', '#3c4a6e']), []);

  const geometry = useMemo(() => {
    const positions = new Float32Array(STARS * 3);
    const colors = new Float32Array(STARS * 3);
    const sizes = new Float32Array(STARS);
    const alphas = new Float32Array(STARS);
    const phases = new Float32Array(STARS);
    const warm = new THREE.Color('#ffd9a8');
    const white = new THREE.Color('#f2f0ff');
    const blue = new THREE.Color('#b8c8ff');
    const pink = new THREE.Color('#ff9cc8');
    const c = new THREE.Color();
    for (let i = 0; i < STARS; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const bulge = bulgeWeight(theta);
      let latitude = gaussian() * (0.07 + bulge * 0.12);
      // The dust lane: near the centre, stars that fall in a thin wavy strip are
      // pushed out of it, leaving a dark rift down the middle of the band.
      const rift = 0.015 * Math.sin(theta * 3);
      const riftHalfWidth = 0.022 * bulge;
      if (Math.abs(latitude - rift) < riftHalfWidth && Math.random() < 0.85) {
        latitude = rift + Math.sign(latitude - rift || 1) * (riftHalfWidth + Math.random() * 0.03);
      }
      const v = onBand(INNER + Math.random() * DEPTH, theta, latitude);
      positions.set([v.x, v.y, v.z], i * 3);

      c.copy(blue).lerp(white, Math.random()).lerp(warm, bulge * 0.8);
      if (Math.random() < 0.015 && bulge < 0.5) c.copy(pink);
      colors.set([c.r, c.g, c.b], i * 3);
      const bright = Math.random() < 0.02;
      sizes[i] = bright ? 2.4 + Math.random() * 1.2 : 0.8 + Math.random() * 1.0;
      alphas[i] = bright ? 0.8 : 0.18 + Math.random() * 0.3 + bulge * 0.15;
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

  // Soft glow behind the stars, thicker and warmer toward the centre.
  const haze = useMemo(
    () =>
      Array.from({ length: HAZE_COUNT }, (_, i) => {
        const theta = (i / HAZE_COUNT) * Math.PI * 2;
        const bulge = bulgeWeight(theta);
        return {
          position: onBand(HAZE_RADIUS, theta, 0).toArray(),
          scale: [60 + bulge * 30, 22 + bulge * 18, 1],
          opacity: 0.14 + bulge * 0.16,
          warm: bulge > 0.3,
        };
      }),
    [],
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    if (ref.current) ref.current.rotation.y = t * 0.004;
    if (age.current >= FADE_S) return;
    age.current = Math.min(FADE_S, age.current + delta);
    const fade = 1 - Math.pow(1 - age.current / FADE_S, 3);
    material.uniforms.uOpacity.value = fade;
    hazeRefs.current.forEach((sprite, i) => {
      if (sprite) sprite.material.opacity = haze[i].opacity * fade;
    });
  });

  return (
    <group ref={ref}>
      {haze.map(({ position, scale, warm }, i) => (
        <sprite key={i} ref={(el) => (hazeRefs.current[i] = el)} position={position} scale={scale}>
          <spriteMaterial map={warm ? warmHaze : coolHaze} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
      <points geometry={geometry} material={material} />
    </group>
  );
}

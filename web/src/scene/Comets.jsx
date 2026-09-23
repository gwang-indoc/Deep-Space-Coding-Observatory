import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGlowPointsMaterial } from './glowPoints.js';
import { glowTexture } from './textures.js';

const TAIL_POINTS = 900;

// Ambient comets on eccentric orbits with the sun at one focus. They speed up
// near perihelion (Kepler's second law) and grow a longer tail as they do.
// `rate` is the specific angular momentum r²·dθ/dt; these give ~40s and ~55s periods.
const COMETS = [
  { a: 11, e: 0.7, tilt: [0.35, 0, 0.2], rate: 13.6, phase: 2.6, ion: '#7fc8ff', dust: '#fff0d0' },
  { a: 9, e: 0.6, tilt: [-0.5, 1.8, -0.1], rate: 7.4, phase: 0.6, ion: '#9fb0ff', dust: '#ffe2c0' },
];

function Comet({ a, e, tilt, rate, phase, ion, dust }) {
  const headRef = useRef(null);
  const comaRef = useRef(null);
  const state = useRef({ theta: phase });
  const glow = useMemo(() => glowTexture(), []);
  const material = useMemo(() => createGlowPointsMaterial({ twinkle: 0.15 }), []);
  const orbitMatrix = useMemo(() => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...tilt)), [tilt]);
  const vectors = useMemo(() => ({ pos: new THREE.Vector3(), next: new THREE.Vector3(), away: new THREE.Vector3(), vel: new THREE.Vector3(), dustDir: new THREE.Vector3() }), []);

  // Two tails: a straight blue ion tail pointing directly away from the sun,
  // and a broader curved dust tail that lags along the orbit.
  const { geometry, offsets } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const colors = new Float32Array(TAIL_POINTS * 3);
    const sizes = new Float32Array(TAIL_POINTS);
    const alphas = new Float32Array(TAIL_POINTS);
    const phases = new Float32Array(TAIL_POINTS);
    const spread = [];
    const ionColor = new THREE.Color(ion);
    const dustColor = new THREE.Color(dust);
    for (let i = 0; i < TAIL_POINTS; i += 1) {
      const isIon = i % 2 === 0;
      const t = Math.pow(Math.random(), 0.8);
      const c = isIon ? ionColor : dustColor;
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = (isIon ? 0.3 : 0.55) * (1 - t * 0.6);
      alphas[i] = Math.pow(1 - t, 1.5) * (isIon ? 0.22 : 0.14);
      phases[i] = Math.random();
      spread.push({ isIon, t, side: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5) });
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TAIL_POINTS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    return { geometry: g, offsets: spread };
  }, [ion, dust]);

  const orbitPoint = (theta, target) => {
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(theta));
    return target.set(Math.cos(theta) * r, 0, Math.sin(theta) * r).applyMatrix4(orbitMatrix);
  };

  useFrame((frame, delta) => {
    const s = state.current;
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(s.theta));
    s.theta += (rate / (r * r)) * Math.min(delta, 0.1);

    const { pos, next, away, vel, dustDir } = vectors;
    orbitPoint(s.theta, pos);
    orbitPoint(s.theta + 0.01, next);
    vel.subVectors(next, pos).normalize();
    away.copy(pos).normalize();
    dustDir.copy(away).addScaledVector(vel, -0.6).normalize();

    headRef.current.position.copy(pos);
    comaRef.current.position.copy(pos);
    const heat = THREE.MathUtils.clamp(6 / r, 0.15, 1.6);
    comaRef.current.scale.setScalar(0.3 + heat * 0.35);

    const tailLength = 1 + heat * 4;
    const positions = geometry.attributes.position;
    for (let i = 0; i < TAIL_POINTS; i += 1) {
      const o = offsets[i];
      const dir = o.isIon ? away : dustDir;
      const width = o.t * (o.isIon ? 0.12 : 0.45) * tailLength * 0.3;
      // The dust tail bends further back along the orbit the farther out it goes.
      const bend = o.isIon ? 0 : o.t * o.t * 0.5 * tailLength;
      positions.setXYZ(
        i,
        pos.x + dir.x * o.t * tailLength - vel.x * bend + o.side.x * width,
        pos.y + dir.y * o.t * tailLength - vel.y * bend + o.side.y * width,
        pos.z + dir.z * o.t * tailLength - vel.z * bend + o.side.z * width,
      );
    }
    positions.needsUpdate = true;
    material.uniforms.uTime.value = frame.clock.elapsedTime;
  });

  return (
    <group>
      <points geometry={geometry} material={material} frustumCulled={false} />
      <mesh ref={headRef}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <sprite ref={comaRef}>
        <spriteMaterial map={glow} color={ion} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  );
}

export default function Comets() {
  return (
    <group>
      {COMETS.map((comet) => (
        <Comet key={comet.phase} {...comet} />
      ))}
    </group>
  );
}

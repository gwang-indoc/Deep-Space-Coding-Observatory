import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { selectActiveShips, SHIP_TTL_MS } from '../state/orbitReducer.js';
import { createGlowPointsMaterial } from './glowPoints.js';
import { glowTexture } from './textures.js';

const TRAIL_LENGTH = 40;

function shipPosition(progress, target) {
  const angle = progress * Math.PI * 2;
  const radius = 4 + progress * 4;
  return target.set(Math.cos(angle) * radius, 0.1 + Math.sin(progress * Math.PI) * 0.6, Math.sin(angle) * radius);
}

// A small rocket: white hull, colored nose and fins, flickering engine flame
// and a fading exhaust trail along its spiral path.
function ShipMesh({ ship }) {
  const groupRef = useRef(null);
  const craftRef = useRef(null);
  const flameRef = useRef(null);
  const trailRef = useRef(null);
  const accent = ship.kind === 'tests' ? '#7dffb0' : '#ffd479';
  const glow = useMemo(() => glowTexture(), []);
  const material = useMemo(() => createGlowPointsMaterial(), []);
  const vectors = useMemo(() => ({ pos: new THREE.Vector3(), ahead: new THREE.Vector3(), trail: new THREE.Vector3() }), []);

  const trailGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const colors = new Float32Array(TRAIL_LENGTH * 3);
    const sizes = new Float32Array(TRAIL_LENGTH);
    const alphas = new Float32Array(TRAIL_LENGTH);
    const exhaust = new THREE.Color('#ffb070');
    const tip = new THREE.Color(accent);
    for (let i = 0; i < TRAIL_LENGTH; i += 1) {
      const t = i / TRAIL_LENGTH;
      const c = exhaust.clone().lerp(tip, t);
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 0.35 * (1 - t) + 0.05;
      alphas[i] = (1 - t) * 0.8;
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH), 1));
    return g;
  }, [accent]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const progress = Math.min(1, Math.max(0, (Date.now() - ship.startedAt) / SHIP_TTL_MS));
    const visible = progress < 1;
    groupRef.current.visible = visible;
    if (!visible) return;

    shipPosition(progress, vectors.pos);
    shipPosition(Math.min(1, progress + 0.01), vectors.ahead);
    craftRef.current.position.copy(vectors.pos);
    craftRef.current.lookAt(vectors.ahead);

    flameRef.current.scale.set(1, 1, 0.8 + Math.random() * 0.6);

    // Trail samples the path behind the ship, spreading slightly as it cools.
    const positions = trailGeometry.attributes.position;
    for (let i = 0; i < TRAIL_LENGTH; i += 1) {
      const back = Math.max(0, progress - i * 0.004);
      shipPosition(back, vectors.trail);
      const jitter = i * 0.002;
      positions.setXYZ(i, vectors.trail.x + (Math.random() - 0.5) * jitter, vectors.trail.y + (Math.random() - 0.5) * jitter, vectors.trail.z + (Math.random() - 0.5) * jitter);
    }
    positions.needsUpdate = true;
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group ref={groupRef}>
      <points ref={trailRef} geometry={trailGeometry} material={material} frustumCulled={false} />
      {/* The craft's local +z axis points along its heading (lookAt). */}
      <group ref={craftRef}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.06, 0.07, 0.3, 16]} />
            <meshStandardMaterial color="#eef1f6" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.21, 0]}>
            <coneGeometry args={[0.06, 0.13, 16]} />
            <meshStandardMaterial color={accent} metalness={0.3} roughness={0.4} emissive={accent} emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 0.05, 0.055]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.022, 16]} />
            <meshBasicMaterial color="#9fe0ff" toneMapped={false} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <group key={i} rotation={[0, (i / 3) * Math.PI * 2, 0]}>
              <mesh position={[0.08, -0.12, 0]}>
                <boxGeometry args={[0.06, 0.1, 0.012]} />
                <meshStandardMaterial color={accent} metalness={0.3} roughness={0.5} />
              </mesh>
            </group>
          ))}
          <mesh ref={flameRef} position={[0, -0.22, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.045, 0.16, 12, 1, true]} />
            <meshBasicMaterial color="#ffd08a" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          <sprite position={[0, -0.24, 0]} scale={0.35}>
            <spriteMaterial map={glow} color="#ff9a3c" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
        </group>
      </group>
    </group>
  );
}

function TestResultRing({ testResultRing }) {
  const glow = useMemo(() => glowTexture(), []);
  if (!testResultRing) return null;
  const total = testResultRing.passed + testResultRing.failed;
  if (total === 0) return null;

  return (
    <group>
      {Array.from({ length: total }).map((_, index) => {
        const angle = (index / total) * Math.PI * 2;
        const passed = index < testResultRing.passed;
        const color = passed ? '#7dffb0' : '#ff6b6b';
        return (
          <group key={index} position={[Math.cos(angle) * 8.5, 0, Math.sin(angle) * 8.5]}>
            <mesh>
              <sphereGeometry args={[0.07, 12, 12]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            <sprite scale={0.45}>
              <spriteMaterial map={glow} color={color} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </sprite>
          </group>
        );
      })}
    </group>
  );
}

export default function Ship({ ships, testResultRing }) {
  const now = Date.now();
  const active = selectActiveShips({ ships }, now);

  return (
    <group>
      {active.map((ship) => (
        <ShipMesh key={ship.id} ship={ship} />
      ))}
      <TestResultRing testResultRing={testResultRing} />
    </group>
  );
}

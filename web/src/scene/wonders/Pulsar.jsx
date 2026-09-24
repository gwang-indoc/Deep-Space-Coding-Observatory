import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glowTexture } from '../textures.js';

const BEAM_LENGTH = 16;

// Beams fade out along their length (cone uv.y runs base → tip).
function createBeamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#9fd0ff') } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float a = pow(vUv.y, 2.5) * 0.55;
        gl_FragColor = vec4(uColor * 1.6, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

// A spinning neutron star sweeping two lighthouse beams across the sky.
export default function Pulsar() {
  const spinRef = useRef(null);
  const coreRef = useRef(null);
  const glow = useMemo(() => glowTexture(), []);
  const beam = useMemo(() => createBeamMaterial(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (spinRef.current) spinRef.current.rotation.y = t * 2.4;
    if (coreRef.current) coreRef.current.material.opacity = 0.7 + Math.max(0, Math.sin(t * 2.4 * 2)) * 0.3;
  });

  return (
    <group rotation={[0.3, 0, 0.5]}>
      <mesh>
        <sphereGeometry args={[0.3, 24, 24]} />
        <meshBasicMaterial color="#e8f4ff" toneMapped={false} />
      </mesh>
      <sprite ref={coreRef} scale={3.2}>
        <spriteMaterial map={glow} color="#8fc4ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      {/* Magnetic axis is tilted off the spin axis, so the beams sweep a cone. */}
      <group ref={spinRef}>
        <group rotation={[0, 0, 0.55]}>
          {[1, -1].map((dir) => (
            <mesh key={dir} material={beam} position={[0, (dir * BEAM_LENGTH) / 2, 0]} rotation={[dir > 0 ? Math.PI : 0, 0, 0]}>
              <coneGeometry args={[1.4, BEAM_LENGTH, 32, 1, true]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

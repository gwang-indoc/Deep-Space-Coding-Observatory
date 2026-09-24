import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { glowTexture } from '../textures.js';

const HORIZON = 1.2;
const DISK_INNER = 1.7;
const DISK_OUTER = 5.2;

// Accretion disk: white-hot at the inner edge cooling to deep red, with
// streaks that shear as they orbit (inner material moves faster).
function createDiskMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vPos;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float r = length(vPos);
        float t = clamp((r - ${DISK_INNER.toFixed(2)}) / (${DISK_OUTER.toFixed(2)} - ${DISK_INNER.toFixed(2)}), 0.0, 1.0);
        float angle = atan(vPos.y, vPos.x);
        float swirl = angle * 3.0 + uTime * (2.5 / (0.3 + r * 0.4)) - r * 1.3;
        float streaks = noise(vec2(swirl, r * 3.0)) * 0.6 + noise(vec2(swirl * 2.0, r * 7.0)) * 0.4;
        vec3 hot = vec3(1.0, 0.95, 0.85);
        vec3 warm = vec3(1.0, 0.55, 0.15);
        vec3 cold = vec3(0.6, 0.08, 0.02);
        vec3 col = mix(hot, warm, smoothstep(0.0, 0.35, t));
        col = mix(col, cold, smoothstep(0.35, 1.0, t));
        float edge = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.7, 1.0, t));
        float a = edge * (0.45 + streaks * 0.75);
        gl_FragColor = vec4(col * (1.6 - t), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

export default function BlackHole() {
  const disk = useMemo(() => createDiskMaterial(), []);
  const glow = useMemo(() => glowTexture(), []);

  useFrame((state) => {
    disk.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group>
      <sprite scale={16}>
        <spriteMaterial map={glow} color="#ff7a2a" transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      {/* Drawn opaque first so it hides the far side of the disk. */}
      <mesh renderOrder={-1}>
        <sphereGeometry args={[HORIZON, 48, 48]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh material={disk} rotation={[-1.1, 0, 0.3]}>
        <ringGeometry args={[DISK_INNER, DISK_OUTER, 160, 8]} />
      </mesh>
      {/* Photon ring: light bent all the way around the horizon, always facing us. */}
      <Billboard>
        <mesh>
          <ringGeometry args={[HORIZON * 1.02, HORIZON * 1.14, 128]} />
          <meshBasicMaterial color="#ffd9a0" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

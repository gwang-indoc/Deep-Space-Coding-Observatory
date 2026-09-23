import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { selectMissionCompleteFlashVisible } from '../state/orbitReducer.js';
import { glowTexture } from './textures.js';

// Animated photosphere: 3D value-noise granulation sampled in object space (so
// there is no seam or pole pinch), plus limb darkening toward the edge.
function createSunMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vView;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 p = vPos * 2.2;
        float cells = fbm(p * 2.5 + vec3(0.0, uTime * 0.08, uTime * 0.05));
        float flow = fbm(p * 0.8 - vec3(uTime * 0.03));
        float n = clamp(cells * 0.75 + flow * 0.45, 0.0, 1.0);
        vec3 deep = vec3(0.85, 0.28, 0.04);
        vec3 mid = vec3(1.0, 0.62, 0.16);
        vec3 hot = vec3(1.0, 0.93, 0.62);
        vec3 col = mix(deep, mid, smoothstep(0.25, 0.55, n));
        col = mix(col, hot, smoothstep(0.55, 0.85, n));
        float mu = clamp(dot(vNormal, vView), 0.0, 1.0);
        float limb = 0.45 + 0.55 * pow(mu, 0.5);
        gl_FragColor = vec4(col * uColor * limb * 1.35, 1.0);
      }
    `,
    toneMapped: false,
  });
}

const ACTIVE = { surface: '#ffffff', corona: '#ffc766', outer: '#ffa040', light: 3.2 };
const IDLE = { surface: '#a0461f', corona: '#8a2a10', outer: '#4a1508', light: 1.1 };
const FLASH = { surface: '#ffffff', corona: '#fff3d6', outer: '#ffd9a0', light: 6 };

export default function CentralStar({ missionActive, lastCompletedAt }) {
  const groupRef = useRef(null);
  const surfaceRef = useRef(null);
  const coronaRef = useRef(null);
  const outerRef = useRef(null);
  const lightRef = useRef(null);
  const [flashing, setFlashing] = useState(false);
  const surfaceMaterial = useMemo(() => createSunMaterial(IDLE.surface), []);
  const glow = useMemo(() => glowTexture(), []);
  const target = useMemo(() => ({ surface: new THREE.Color(), corona: new THREE.Color(), outer: new THREE.Color() }), []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const flashVisible = selectMissionCompleteFlashVisible({ lastCompletedAt }, Date.now());
    if (flashVisible !== flashing) setFlashing(flashVisible);

    const pulse = flashVisible
      ? 1 + Math.max(0, 1 - (Date.now() - lastCompletedAt) / 2500) * 1.5
      : missionActive
        ? 1 + Math.sin(t * 2) * 0.04
        : 1;
    groupRef.current.scale.setScalar(pulse);

    const palette = flashVisible ? FLASH : missionActive ? ACTIVE : IDLE;
    const k = Math.min(1, delta * 3);
    surfaceMaterial.uniforms.uColor.value.lerp(target.surface.set(palette.surface), k);
    surfaceMaterial.uniforms.uTime.value = t;
    coronaRef.current.material.color.lerp(target.corona.set(palette.corona), k);
    outerRef.current.material.color.lerp(target.outer.set(palette.outer), k);
    lightRef.current.intensity += (palette.light - lightRef.current.intensity) * k;

    surfaceRef.current.rotation.y = t * 0.05;
    coronaRef.current.material.rotation = t * 0.03;
    const breathe = 1 + Math.sin(t * 1.3) * 0.04;
    coronaRef.current.scale.setScalar(4.6 * breathe);
    outerRef.current.scale.setScalar(7.5 * (1 + Math.sin(t * 0.7) * 0.05));
  });

  return (
    <group>
      <pointLight ref={lightRef} position={[0, 0, 0]} color="#fff1dc" intensity={IDLE.light} decay={0} />
      <group ref={groupRef}>
        <mesh ref={surfaceRef} material={surfaceMaterial}>
          <sphereGeometry args={[1.2, 64, 64]} />
        </mesh>
        <sprite ref={coronaRef} scale={4.6}>
          <spriteMaterial map={glow} color={IDLE.corona} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
        <sprite ref={outerRef} scale={7.5}>
          <spriteMaterial map={glow} color={IDLE.outer} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      </group>
      {flashing && (
        <Html center position={[0, 2.2, 0]} distanceFactor={10}>
          <div style={{ color: '#ffe9c2', fontFamily: 'monospace', letterSpacing: '0.2em', whiteSpace: 'nowrap', textShadow: '0 0 12px #ffb347' }}>
            MISSION COMPLETE
          </div>
        </Html>
      )}
    </group>
  );
}

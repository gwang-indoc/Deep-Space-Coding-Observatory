import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glowTexture } from './textures.js';

// Solar panel cells: dark blue grid with thin silver lines.
function usePanelTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#12306b';
    ctx.fillRect(0, 0, 64, 32);
    ctx.strokeStyle = '#9fb4d8';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 64; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 32);
      ctx.stroke();
    }
    for (let y = 0; y <= 32; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

// A satellite is one file being touched: gold-foil bus, two solar wings,
// a dish antenna and a beacon that flashes while the file is being edited.
function Satellite({ index, total, blinkCount, panelTexture }) {
  const groupRef = useRef(null);
  const beaconRef = useRef(null);
  const glow = useMemo(() => glowTexture(), []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const angle = (index / Math.max(total, 1)) * Math.PI * 2 + t * 0.5;
    const radius = 6.5;
    groupRef.current.position.set(Math.cos(angle) * radius, Math.sin(t + index) * 0.3, Math.sin(angle) * radius);
    // Keep the solar wings facing the sun and the craft slowly rolling.
    groupRef.current.lookAt(0, 0, 0);
    groupRef.current.rotateZ(t * 0.3 + index);
    if (beaconRef.current) {
      const on = blinkCount > 0 ? (Math.sin(t * 8) > 0 ? 1 : 0.15) : 0.35 + Math.sin(t * 2 + index) * 0.15;
      beaconRef.current.material.opacity = on;
    }
  });

  return (
    <group ref={groupRef} scale={0.9}>
      <mesh>
        <boxGeometry args={[0.12, 0.12, 0.16]} />
        <meshStandardMaterial color="#d9a441" metalness={0.8} roughness={0.35} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.1, 0, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.08, 6]} />
            <meshStandardMaterial color="#c0c6d4" metalness={0.9} roughness={0.3} />
          </mesh>
          <mesh position={[side * 0.27, 0, 0]}>
            <boxGeometry args={[0.3, 0.005, 0.13]} />
            <meshStandardMaterial map={panelTexture} metalness={0.6} roughness={0.25} emissive="#0a1a40" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0, -0.11]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.06, 0.04, 20, 1, true]} />
        <meshStandardMaterial color="#e8ecf2" metalness={0.4} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <sprite ref={beaconRef} position={[0, 0.08, 0]} scale={0.18}>
        <spriteMaterial map={glow} color={blinkCount > 0 ? '#ff5a5a' : '#7dffb0'} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  );
}

export default function Satellites({ satellites }) {
  const panelTexture = usePanelTexture();
  if (!satellites || satellites.length === 0) return null;

  return (
    <group>
      {satellites.map((satellite, index) => (
        <Satellite key={satellite.file} index={index} total={satellites.length} blinkCount={satellite.blinkCount} panelTexture={panelTexture} />
      ))}
    </group>
  );
}

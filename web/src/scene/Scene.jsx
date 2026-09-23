import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

export default function Scene({ renderingPaused, mode = 'active', children }) {
  return (
    <Canvas
      frameloop={renderingPaused ? 'never' : 'always'}
      dpr={[1, 1.5]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ position: 'absolute', inset: 0, background: '#010208' }}
    >
      <PerspectiveCamera makeDefault position={[0, 7, 13]} fov={50} />
      <OrbitControls enablePan={false} minDistance={5} maxDistance={40} autoRotate={mode === 'active'} autoRotateSpeed={0.15} enableDamping />
      {/* Faint fill so the night sides of planets are not pure black; the sun is the key light. */}
      <ambientLight intensity={0.12} color="#8ea2ff" />
      {children}
      <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
        <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.55} luminanceSmoothing={0.3} radius={0.75} />
        <Vignette offset={0.25} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}

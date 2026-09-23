import { Canvas } from '@react-three/fiber';

export default function Scene({ missionActive, renderingPaused, children }) {
  return (
    <Canvas
      frameloop={renderingPaused ? 'never' : 'always'}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 12], fov: 50 }}
      style={{ position: 'absolute', inset: 0, background: '#02030a' }}
    >
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 5]} intensity={missionActive ? 1.2 : 0.4} />
      {children}
    </Canvas>
  );
}

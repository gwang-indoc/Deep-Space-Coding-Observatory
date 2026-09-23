import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';

export default function Scene({ missionActive, renderingPaused, children }) {
  return (
    <Canvas
      frameloop={renderingPaused ? 'never' : 'always'}
      dpr={[1, 1.5]}
      style={{ position: 'absolute', inset: 0, background: '#02030a' }}
    >
      <PerspectiveCamera makeDefault position={[0, 7, 13]} fov={50} onUpdate={(self) => self.lookAt(0, 0, 0)} />
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 5]} intensity={missionActive ? 1.2 : 0.4} />
      {children}
    </Canvas>
  );
}

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

const STATUS_COLOR = {
  pending: '#3a3f55',
  in_progress: '#5fb0ff',
  completed: '#7dffb0',
};

function Planet({ index, total, status }) {
  const groupRef = useRef(null);
  const radius = 3 + index * 1.1;
  const speed = status === 'in_progress' ? 0.35 : status === 'completed' ? 0.12 : 0;

  useFrame((state) => {
    if (!groupRef.current) return;
    const angle = (index / total) * Math.PI * 2 + state.clock.elapsedTime * speed;
    groupRef.current.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial
          color={STATUS_COLOR[status] ?? STATUS_COLOR.pending}
          emissive={STATUS_COLOR[status] ?? STATUS_COLOR.pending}
          emissiveIntensity={status === 'pending' ? 0.05 : 0.5}
        />
      </mesh>
    </group>
  );
}

export default function PlanetLayer({ todos }) {
  if (!todos || todos.length === 0) return null;

  return (
    <group>
      {todos.map((todo, index) => (
        <Planet key={todo.id} index={index} total={todos.length} status={todo.status} />
      ))}
    </group>
  );
}
